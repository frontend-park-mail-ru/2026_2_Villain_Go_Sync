import { test, expect } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

/**
 * Подменяет списки и изображения, записывая запросы к ним.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} kind Вариант адреса или ответа изображения.
 * @returns {Promise<object>} Данные и запросы API.
 */
async function setup(page, kind) {
  const logo = '/api/employers/5/logo?v=2&size=small';
  const avatar = '/api/seekers/6/avatar?v=2&size=small';
  const media = (url) => kind === 'null' ? null : kind === 'empty' ? '' : kind === 'whitespace' ? '   '
    : kind === 'external' ? 'https://images.example.invalid/photo.png' : kind === 'script' ? 'javascript:alert(1)' : url;
  const vacancy = {
    id: 9, employer_id: 5, company_name: 'Компания', title: 'Разработчик', description: '',
    salary_from: null, salary_to: null, currency: 'RUB', created_at: '2026-11-09',
    ...(kind === 'omitted' ? {} : { logo_url: media(logo) }),
  };
  const applicant = {
    application_id: 1, vacancy_id: 9, vacancy_title: 'Разработчик', seeker_id: 6, resume_id: 8,
    first_name: 'Иван', last_name: 'Петров', status: 'created', applied_at: '2026-11-09', resume_title: 'Резюме', cover_letter: null,
    ...(kind === 'omitted' ? {} : { avatar_url: media(avatar) }),
  };
  const state = { vacancies: [vacancy], imageRequests: [], profileRequests: [], externalRequests: [] };
  await page.route('https://images.example.invalid/**', (route) => {
    state.externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/logo') || path.endsWith('/avatar')) {
      state.imageRequests.push({ method: request.method(), path: path + url.search });
      return route.fulfill(kind === 'broken' ? { status: 404 } : { contentType: 'image/png', body: png });
    }
    if (/^\/api\/(employers|seekers)\/\d+$/.test(path)) { state.profileRequests.push(path); }
    let data = [];
    if (path === '/api/me') { data = { id: 5, role: 'employer' }; }
    if (path === '/api/employers/5') { data = { user_id: 5, company_name: 'Компания', description: '', website: '', logo_url: null }; }
    if (path === '/api/vacancies' || path === '/api/employer/vacancies') { data = state.vacancies; }
    if (path === '/api/vacancies/9') { data = vacancy; }
    if (path === '/api/employer/applications') { data = [applicant]; }
    return route.fulfill({ json: { data } });
  });
  return state;
}

for (const path of ['/', '/my/vacancies', '/vacancies/9', '/applicants']) {
  for (const kind of ['present', 'null', 'omitted', 'empty', 'whitespace', 'broken', 'external']) {
    test(`картинка карточки: ${path}, ${kind}`, async ({ page }) => {
      const state = await setup(page, kind);
      await page.goto(path);
      const applicant = path === '/applicants';
      const container = page.locator(applicant ? '.applicant-card__avatar' : '.vacancy-card__logo');
      await expect(container).toBeVisible();
      if (kind === 'present') {
        await expect(container.locator('img')).toHaveCSS('opacity', '1');
        await expect(container.locator('img')).toHaveAttribute('loading', 'lazy');
      } else {
        if (kind === 'broken') { await expect.poll(() => state.imageRequests.length).toBe(1); }
        await expect(container.locator('img')).toHaveCount(0);
        await expect(container).toHaveText(applicant ? 'ИП' : 'Ко');
      }
      expect(state.imageRequests).toEqual(['present', 'broken'].includes(kind)
        ? [{ method: 'GET', path: applicant ? '/api/seekers/6/avatar?v=2&size=small' : '/api/employers/5/logo?v=2&size=small' }] : []);
      expect(state.externalRequests).toEqual([]);
      expect(state.profileRequests.filter((request) => request !== '/api/employers/5')).toEqual([]);
      expect(state.profileRequests).toHaveLength(1);
    });
  }
}

test('при пагинации и поиске картинки запрашиваются только для карточек с URL', async ({ page }) => {
  const state = await setup(page, 'present');
  const vacancy = state.vacancies[0];
  state.vacancies = Array.from({ length: 13 }, (_, index) => ({
    ...vacancy, id: index + 1, title: index === 12 ? 'С логотипом' : `Без логотипа ${index + 1}`,
    logo_url: index === 12 ? vacancy.logo_url : null,
  }));
  await page.goto('/');
  await expect(page.locator('.vacancy-card__logo')).toHaveCount(12);
  expect(state.imageRequests).toEqual([]);
  await page.getByRole('button', { name: 'Страница 2', exact: true }).click();
  await expect(page.locator('.vacancy-card__logo img')).toHaveCSS('opacity', '1');
  expect(state.imageRequests).toHaveLength(1);
  await page.locator('#vacancies-query').fill('Без логотипа');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.locator('.vacancy-card__logo')).toHaveCount(12);
  await expect(page.locator('.vacancy-card__logo img')).toHaveCount(0);
  expect(state.imageRequests).toHaveLength(1);
});

test('адрес с javascript не создаёт изображение', async ({ page }) => {
  const state = await setup(page, 'script');
  await page.goto('/');
  await expect(page.locator('.vacancy-card__logo')).toHaveText('Ко');
  await expect(page.locator('.vacancy-card__logo img')).toHaveCount(0);
  expect(state.imageRequests).toEqual([]);
});
