import { test, expect } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

/**
 * Настраивает отклики и управляемую загрузку аватарок без записи на сервер.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {object} options Настройки сценария.
 * @param {number} options.count Количество откликов.
 * @param {boolean} options.delayed Задержать ответ изображения до release.
 * @param {boolean} options.broken Изображение возвращает ошибку.
 * @param {boolean} options.missing Адрес изображения отсутствует.
 * @param {boolean} options.shared Несколько откликов одного соискателя.
 * @returns {Promise<object>} Запросы и управление задержкой.
 */
async function setup(page, { count = 13, delayed = false, broken = false, missing = false, shared = false } = {}) {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const state = { requests: [], release };
  const applicants = Array.from({ length: count }, (_, index) => ({
    application_id: index + 1, vacancy_id: 9, vacancy_title: `Вакансия ${index + 1}`, seeker_id: shared ? 6 : index + 6,
    resume_id: 8, first_name: shared || index === 0 ? 'Иван' : 'Мария', last_name: 'Петров', status: 'created',
    applied_at: '2026-11-09', resume_title: 'Резюме', cover_letter: null,
    avatar_url: missing ? null : `/api/seekers/${shared ? 6 : index + 6}/avatar`,
  }));
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/avatar')) {
      state.requests.push(path);
      if (delayed) { await ready; }
      return route.fulfill(broken ? { status: 404 } : { contentType: 'image/png', body: png });
    }
    let data = [];
    if (path === '/api/me') { data = { id: 5, role: 'employer' }; }
    if (path === '/api/employers/5') { data = { user_id: 5, company_name: 'Компания', description: '', website: '', logo_url: null }; }
    if (path === '/api/employer/applications') { data = applicants; }
    return route.fulfill({ json: { data } });
  });
  return state;
}

/**
 * Запускает поиск и проверяет картинку в том же кадре, до любых новых событий загрузки.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} value Поисковый запрос.
 * @returns {Promise<boolean>} Все ли видимые аватарки уже готовы к показу.
 */
async function searchImmediately(page, value) {
  return page.evaluate((query) => {
    const input = document.querySelector('#applicants-query');
    input.value = query;
    input.form.requestSubmit();
    const images = [...document.querySelectorAll('.applicant-card__avatar img')];
    return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1');
  }, value);
}

test('поиск и возврат на страницу сохраняют загруженные аватарки без мигания', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/applicants');
  await expect(page.locator('.applicant-card__avatar img')).toHaveCount(12);
  await expect.poll(() => page.locator('.applicant-card__avatar img').evaluateAll((images) =>
    images.every((image) => image.complete && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1'))).toBe(true);
  const initialRequests = state.requests.length;
  expect(await searchImmediately(page, 'Иван')).toBe(true);
  expect(await searchImmediately(page, 'Иван')).toBe(true);
  await searchImmediately(page, 'Несуществующий соискатель');
  await expect(page.getByRole('heading', { name: 'По вашему запросу ничего не найдено' })).toBeVisible();
  expect(await searchImmediately(page, '')).toBe(true);
  expect(state.requests).toHaveLength(initialRequests);
  await page.getByRole('button', { name: 'Страница 2', exact: true }).click();
  await expect(page.locator('.applicant-card__avatar img')).toHaveCSS('opacity', '1');
  const afterSecondPage = state.requests.length;
  const immediate = await page.evaluate(() => {
    document.querySelector('[data-page="1"]').click();
    return [...document.querySelectorAll('.applicant-card__avatar img')].every((image) =>
      image.complete && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1');
  });
  expect(immediate).toBe(true);
  await expect(page.locator('.applicant-card__avatar img')).toHaveCount(12);
  expect(state.requests).toHaveLength(afterSecondPage);
});

for (const broken of [false, true]) {
  test(`медленная аватарка: ${broken ? 'ошибка' : 'успех'}, поиск не перезапускает загрузку`, async ({ page }) => {
    const state = await setup(page, { count: 1, delayed: true, broken });
    try {
      await page.goto('/applicants', { waitUntil: 'domcontentloaded' });
      await expect.poll(() => state.requests.length).toBe(1);
      const avatar = page.locator('.applicant-card__avatar');
      await expect(avatar).toHaveClass(/image-frame_loading/);
      await expect(avatar.locator('span')).toBeHidden();
      await page.locator('#applicants-query').fill('Иван');
      await page.getByRole('button', { name: 'Найти', exact: true }).click();
      await expect(avatar).toHaveClass(/image-frame_loading/);
      await expect(avatar.locator('span')).toBeHidden();
      expect(state.requests).toHaveLength(1);
      state.release();
      await expect(avatar).not.toHaveClass(/image-frame_loading/);
      if (broken) {
        await expect(avatar.locator('img')).toHaveCount(0);
        await expect(avatar.locator('span')).toBeVisible();
        await expect(avatar).toHaveText('ИП');
      } else {
        await expect(avatar.locator('img')).toHaveCSS('opacity', '1');
        await expect(avatar.locator('span')).toBeHidden();
      }
    } finally { state.release(); }
  });
}

test('отсутствующая аватарка сразу показывает инициалы без загрузочного состояния', async ({ page }) => {
  const state = await setup(page, { count: 1, missing: true });
  await page.goto('/applicants');
  const avatar = page.locator('.applicant-card__avatar');
  await expect(avatar).toHaveText('ИП');
  await expect(avatar.locator('span')).toBeVisible();
  await expect(avatar).not.toHaveClass(/image-frame_loading/);
  expect(state.requests).toEqual([]);
});

test('два отклика одного соискателя сохраняют обе аватарки после поиска', async ({ page }) => {
  const state = await setup(page, { count: 2, shared: true });
  await page.goto('/applicants');
  await expect(page.locator('.applicant-card__avatar img')).toHaveCount(2);
  await expect.poll(() => page.locator('.applicant-card__avatar img').evaluateAll((images) =>
    images.every((image) => image.complete && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1'))).toBe(true);
  const initialRequests = state.requests.length;
  expect(await searchImmediately(page, 'Вакансия 1')).toBe(true);
  expect(await searchImmediately(page, '')).toBe(true);
  await expect(page.locator('.applicant-card__avatar img')).toHaveCount(2);
  expect(state.requests).toHaveLength(initialRequests);
});
