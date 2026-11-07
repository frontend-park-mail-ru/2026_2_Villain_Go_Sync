import { test, expect } from '@playwright/test';

for (const role of ['seeker', 'employer']) {
  test(`создание после заполнения профиля: ${role}`, async ({ page }) => {
    let profile = null;
    const destination = role === 'seeker' ? '/resumes/new' : '/vacancies/new';
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/me') {
        return route.fulfill({ json: { data: { id: 5, role } } });
      }
      if (path === `/api/profile/${role}`) {
        profile = request.postDataJSON();
        return route.fulfill({ json: { data: profile } });
      }
      if (path === '/api/seekers/5' || path === '/api/employers/5') {
        return route.fulfill({ status: profile ? 200 : 404, json: profile ? { data: profile } : { error: 'not found' } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto(destination);
    await expect(page.getByText('Сначала заполните профиль')).toBeVisible();
    await page.getByRole('link', { name: 'Заполнить профиль' }).click();
    await page.locator(role === 'seeker' ? '[name="firstName"]' : '[name="companyName"]').fill('Тест');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(destination);
    await expect(page.locator('[name="title"]')).toBeVisible();
  });
}

test('ошибка сервера не считается отсутствием профиля', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill(
    route.request().url().endsWith('/me')
      ? { json: { data: { id: 5, role: 'seeker' } } }
      : { status: 500, json: { error: 'internal error' } },
  ));
  await page.goto('/resumes/new');
  await expect(page.getByText('Не удалось проверить профиль')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Заполнить профиль' })).toHaveCount(0);
});
