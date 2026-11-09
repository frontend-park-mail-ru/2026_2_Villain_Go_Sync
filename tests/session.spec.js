import { test, expect } from '@playwright/test';

for (const failure of [null, 'expired', 'csrf', 'forbidden']) {
  test(`сохранение профиля: ${failure ?? 'успех'}`, async ({ page, context }) => {
    const requests = [];
    let saves = 0;
    let refreshes = 0;
    await context.addCookies([{ name: 'csrf_token', value: 'old-token', url: 'http://localhost:8001' }]);
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push(path);
      let status = 200;
      let body = { data: [] };
      if (path === '/api/me') {body = { data: { id: 5, role: 'seeker' } };}
      if (path === '/api/seekers/5') {body = { data: { user_id: 5, first_name: 'Иван', last_name: '', phone: '', description: '' } };}
      if (path === '/api/refresh') {
        refreshes++;
        await context.addCookies([{ name: 'csrf_token', value: 'new-token', url: 'http://localhost:8001' }]);
      }
      if (path === '/api/profile/seeker') {
        saves++;
        expect(request.headers()['x-csrf-token']).toBe(saves === 1 ? 'old-token' : 'new-token');
        if (saves === 1 && failure) {
          status = failure === 'expired' ? 401 : 403;
          body = { error: failure === 'csrf' ? 'csrf token mismatch' : 'unauthorized' };
        }
      }
      await route.fulfill({ status, json: body });
    });
    await page.goto('/profile/edit');
    await expect(page.getByRole('link', { name: 'Мои резюме' })).toBeVisible();
    await page.locator('[name="firstName"]').fill('Пётр');
    await page.locator('button[type="submit"]').click();
    if (failure === 'forbidden') {
      await expect(page.getByText('Не удалось сохранить профиль. Попробуйте ещё раз')).toBeVisible();
    } else {
      await expect(page).toHaveURL('/profile');
    }
    expect(refreshes).toBe(failure === 'expired' || failure === 'csrf' ? 1 : 0);
    expect(saves).toBe(1 + refreshes);
    expect(requests).not.toContain('/api/employer/vacancies');
  });
}
