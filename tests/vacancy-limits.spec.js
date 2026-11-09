import { test, expect } from '@playwright/test';

/**
 * Подменяет чтение и сохранение вакансии, записывая только попытки отправки формы.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @returns {Promise<object>} Вакансия и запросы сохранения.
 */
async function setup(page) {
  const state = {
    vacancy: { id: 9, employer_id: 5, company_name: 'Компания', title: 'Разработчик', description: '', salary_from: null, salary_to: null, currency: 'RUB' },
    writes: [],
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') { return route.fulfill({ json: { data: { id: 5, role: 'employer' } } }); }
    if (path === '/api/employers/5') { return route.fulfill({ json: { data: { user_id: 5, company_name: 'Компания', description: '', website: '' } } }); }
    if ((path === '/api/vacancies' || path === '/api/vacancies/9') && ['POST', 'PATCH'].includes(request.method())) {
      const fields = request.postDataJSON();
      state.writes.push({ method: request.method(), fields });
      state.vacancy = { ...state.vacancy, ...fields };
      return route.fulfill({ json: { data: state.vacancy } });
    }
    if (path === '/api/vacancies/9') { return route.fulfill({ json: { data: state.vacancy } }); }
    return route.fulfill({ json: { data: [] } });
  });
  return state;
}

for (const edit of [false, true]) {
  for (const [name, limit] of [['title', 100], ['description', 10_000]]) {
    test(`длина вакансии: ${edit ? 'редактирование' : 'создание'}, ${name}`, async ({ page }) => {
      const state = await setup(page);
      await page.goto(edit ? '/vacancies/9/edit' : '/vacancies/new');
      await page.locator('[name=title]').fill('Разработчик');
      const field = page.locator(`[name=${name}]`);
      const counter = page.locator(`#vacancy-${name}-counter`);
      await field.fill('Я'.repeat(limit - 1));
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await expect(counter).toHaveText(`${limit - 1} / ${limit} символов`);

      await field.fill('Я'.repeat(limit + 1));
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(counter).toHaveText(`${limit + 1} / ${limit} символов`);
      await expect(page.locator(`#vacancy-${name}-message`)).toContainText('Сократите');
      await page.locator('button[type=submit]').click();
      expect(state.writes).toEqual([]);
      await expect(field).toHaveValue('Я'.repeat(limit + 1));
      await expect(field).toBeFocused();

      await field.fill('Я'.repeat(limit));
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await expect(page.locator(`#vacancy-${name}-message`)).toBeEmpty();
      await page.locator('button[type=submit]').click();
      await expect(page).toHaveURL('/vacancies/9');
      expect(state.writes).toHaveLength(1);
      expect(state.writes[0].method).toBe(edit ? 'PATCH' : 'POST');
      expect(state.writes[0].fields[name]).toBe('Я'.repeat(limit));
    });
  }
}

test('длина вакансии: эмодзи считается одним символом', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/vacancies/new');
  const title = page.locator('[name=title]');
  await title.fill('🚀'.repeat(101));
  await expect(page.locator('#vacancy-title-counter')).toHaveText('101 / 100 символов');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await title.fill('🚀'.repeat(100));
  await expect(title).toHaveAttribute('aria-invalid', 'false');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL('/vacancies/9');
  expect(state.writes[0].fields.title).toBe('🚀'.repeat(100));
});

test('старая вакансия с 100 000 символов не обрезается и требует исправления', async ({ page }) => {
  const state = await setup(page);
  state.vacancy.title = 'Я'.repeat(101);
  state.vacancy.description = 'Д'.repeat(100_000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/vacancies/9/edit');
  await expect(page.locator('[name=description]')).toHaveValue(state.vacancy.description);
  await expect(page.locator('#vacancy-description-counter')).toHaveText('100000 / 10000 символов');
  await expect(page.locator('[name=title]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[name=description]')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('button[type=submit]').click();
  expect(state.writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.locator('[name=title]').fill(' ');
  await page.locator('[name=description]').fill('');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#vacancy-title-message')).toHaveText('Введите название вакансии');
  await expect(page.locator('[name=description]')).toHaveAttribute('aria-invalid', 'false');
  await page.locator('[name=title]').fill('Исправленная вакансия');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL('/vacancies/9');
  expect(state.writes[0].fields.description).toBe('');
});

test('длинный черновик восстанавливается целиком с правильными счётчиками', async ({ page }) => {
  const state = await setup(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('hirenoon:creation:5:/vacancies/new', JSON.stringify({ title: 'Я'.repeat(101), description: 'Д'.repeat(10001) }));
  });
  await page.goto('/vacancies/new');
  await expect(page.locator('[name=title]')).toHaveValue('Я'.repeat(101));
  await expect(page.locator('#vacancy-title-counter')).toHaveText('101 / 100 символов');
  await expect(page.locator('#vacancy-description-counter')).toHaveText('10001 / 10000 символов');
  await page.locator('button[type=submit]').click();
  expect(state.writes).toEqual([]);
});
