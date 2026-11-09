import { test, expect } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

for (const broken of [false, true]) {
  test(`фото шапки и логотипы карточек: ${broken ? 'ошибка изображения' : 'успех'}`, async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/avatar') || path.endsWith('/logo')) {
        return route.fulfill(broken ? { status: 404 } : { contentType: 'image/png', body: png });
      }
      let data = [];
      if (path === '/api/me') { data = { id: 5, role: 'seeker' }; }
      if (path === '/api/seekers/5') { data = { user_id: 5, first_name: 'Иван', last_name: 'Петров', avatar_url: '/api/seekers/5/avatar' }; }
      if (path === '/api/vacancies') {
        data = [{ id: 1, employer_id: 4, company_name: 'Компания', title: 'Разработчик', description: '', salary_from: null, salary_to: null, currency: 'RUB', created_at: '2026-11-07' }];
      }
      await route.fulfill({ json: { data } });
    });
    await page.goto('/');
    const avatar = page.locator('.header__avatar');
    const logo = page.locator('.vacancy-card__logo');
    if (broken) {
      await expect(avatar).toHaveText('ИП');
      await expect(logo).toHaveText('Ко');
      await expect(avatar.locator('img')).toHaveCount(0);
      await expect(logo.locator('img')).toHaveCount(0);
    } else {
      await expect(avatar.locator('img')).toBeVisible();
      await expect(logo.locator('img')).toBeVisible();
      await expect(avatar.locator('img')).toHaveCSS('opacity', '1');
      await expect(logo.locator('img')).toHaveCSS('opacity', '1');
    }
    await avatar.click();
    await expect(page.getByRole('link', { name: 'Профиль', exact: true })).toBeVisible();
  });
}
