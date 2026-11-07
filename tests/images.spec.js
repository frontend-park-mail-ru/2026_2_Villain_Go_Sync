import { test, expect } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

for (const role of ['seeker', 'employer']) {
  test(`загрузка, проверка формата и удаление изображения: ${role}`, async ({ page, context }) => {
    let uploaded = false;
    let mutations = 0;
    const field = role === 'seeker' ? 'avatar' : 'logo';
    await context.addCookies([{ name: 'csrf_token', value: 'image-token', url: 'http://localhost:8001' }]);
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'GET' && (path.endsWith('/avatar') || path.endsWith('/logo'))) {
        return route.fulfill(uploaded ? { contentType: 'image/png', body: png } : { status: 404 });
      }
      if (path === `/api/me/${field}`) {
        mutations++;
        expect(request.headers()['x-csrf-token']).toBe('image-token');
        uploaded = request.method() === 'PUT';
        if (uploaded) {
          expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
          expect(request.postData()).toContain(`name="${field}"`);
        }
        return route.fulfill({ status: 204 });
      }
      if (path === '/api/me') {
        return route.fulfill({ json: { data: { id: 5, role } } });
      }
      return route.fulfill({ json: { data: {
        first_name: 'Иван', last_name: '', phone: '', description: '', company_name: 'Компания', website: '',
        [`${field}_url`]: uploaded ? `/api/${role === 'seeker' ? 'seekers' : 'employers'}/5/${field}` : null,
      } } });
    });
    await page.goto('/profile/edit');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
    await expect(page.getByText('Выберите PNG, JPEG или WebP размером от 1 байта до 10 МБ.')).toBeVisible();
    expect(mutations).toBe(0);
    await input.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('Изображение сохранено.')).toBeVisible();
    await expect(page.locator('.header__avatar img')).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: 'Удалить изображение' }).click();
    await expect(page.getByText('Изображение удалено.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Удалить изображение' })).toBeHidden();
    await expect(page.locator('.header__avatar img')).toHaveCount(0);
    expect(mutations).toBe(2);
  });
}
