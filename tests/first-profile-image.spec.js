import { test, expect } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

/**
 * Настраивает первоначально отсутствующий профиль и порядок сохранения его частей.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} role Роль владельца.
 * @returns {Promise<object>} Состояние ответов API.
 */
async function setup(page, role) {
  const field = role === 'seeker' ? 'avatar' : 'logo';
  const collection = role === 'seeker' ? 'seekers' : 'employers';
  const state = { profile: null, uploaded: false, failProfile: false, failImage: false, writes: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') { return route.fulfill({ json: { data: { id: 5, role } } }); }
    if (path === `/api/profile/${role}`) {
      state.writes.push('profile');
      if (state.failProfile) { return route.fulfill({ status: 500, json: { error: 'failed' } }); }
      state.profile = { ...request.postDataJSON(), user_id: 5 };
      return route.fulfill({ json: { data: state.profile } });
    }
    if (path === `/api/me/${field}`) {
      state.writes.push('image');
      expect(state.profile).not.toBeNull();
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      expect(request.postData()).toContain(`name="${field}"`);
      if (state.failImage) { return route.fulfill({ status: 500, json: { error: 'failed' } }); }
      state.uploaded = true;
      return route.fulfill({ status: 204 });
    }
    if (path === `/api/${collection}/5/${field}`) {
      return route.fulfill(state.uploaded ? { contentType: 'image/png', body: png } : { status: 404 });
    }
    if (path === `/api/${collection}/5`) {
      return route.fulfill(state.profile ? { json: { data: { ...state.profile,
        [`${field}_url`]: state.uploaded ? `/api/${collection}/5/${field}` : null,
      } } } : { status: 404, json: { error: 'not found' } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  return state;
}

for (const role of ['seeker', 'employer']) {
  const required = role === 'seeker' ? 'firstName' : 'companyName';

  test(`первый профиль ${role}: предпросмотр, валидация, сохранение по порядку`, async ({ page }) => {
    const state = await setup(page, role);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/profile/edit');
    await page.locator('input[type=file]').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.profile-image img')).toBeVisible();
    await expect(page.locator('.profile-image img')).toHaveAttribute('src', /^blob:/);
    expect(state.writes).toEqual([]);
    await page.locator('button[type=submit]').click();
    await expect(page.locator(`[name=${required}]`)).toHaveAttribute('aria-invalid', 'true');
    expect(state.writes).toEqual([]);
    await page.locator(`[name=${required}]`).fill('Тест');
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL('/profile');
    expect(state.writes).toEqual(['profile', 'image']);
    await expect(page.locator('.profile__avatar img')).toHaveCSS('opacity', '1');
    await expect(page.locator('.header__avatar img')).toHaveCSS('opacity', '1');
  });

  test(`первый профиль ${role}: ошибка изображения не теряет выбор и текст`, async ({ page }) => {
    const state = await setup(page, role);
    state.failImage = true;
    await page.goto('/profile/edit');
    await page.locator(`[name=${required}]`).fill('Тест');
    await page.locator('input[type=file]').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png });
    await page.locator('button[type=submit]').click();
    await expect(page.locator('#profile-image-message')).toContainText('Профиль сохранён, но изображение загрузить не удалось');
    await expect(page).toHaveURL('/profile/edit');
    await expect(page.locator(`[name=${required}]`)).toHaveValue('Тест');
    await expect(page.locator('.profile-image img')).toHaveAttribute('src', /^blob:/);
    state.failImage = false;
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL('/profile');
    expect(state.writes).toEqual(['profile', 'image', 'profile', 'image']);
  });

  test(`первый профиль ${role}: ошибка профиля не запускает загрузку файла`, async ({ page }) => {
    const state = await setup(page, role);
    state.failProfile = true;
    await page.goto('/profile/edit');
    await page.locator(`[name=${required}]`).fill('Тест');
    await page.locator('input[type=file]').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png });
    await page.locator('button[type=submit]').click();
    await expect(page.getByText('Не удалось сохранить профиль. Попробуйте ещё раз')).toBeVisible();
    expect(state.writes).toEqual(['profile']);
    state.failProfile = false;
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL('/profile');
    expect(state.writes).toEqual(['profile', 'profile', 'image']);
  });

  test(`первый профиль ${role}: уход с выбранным фото спрашивает, удаление выбора не вызывает API`, async ({ page }) => {
    const state = await setup(page, role);
    await page.goto('/profile/edit');
    await page.locator('input[type=file]').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png });
    await page.locator('[data-action=cancel]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Остаться', exact: true }).click();
    await expect(page.locator('.profile-image img')).toBeVisible();
    await page.locator('.header__logo').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Остаться', exact: true }).click();
    await expect(page.locator('.profile-image img')).toBeVisible();
    await page.getByRole('button', { name: 'Удалить изображение' }).click();
    await expect(page.locator('.profile-image img')).toBeHidden();
    expect(state.writes).toEqual([]);
    await page.locator('[data-action=cancel]').click();
    await expect(page).toHaveURL('/profile');
  });

  test(`первый профиль ${role}: невалидный файл отклонён, фото необязательно`, async ({ page }) => {
    const state = await setup(page, role);
    await page.goto('/profile/edit');
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
    await expect(page.locator('#profile-image-message')).toContainText('Выберите PNG');
    await expect(page.locator('.profile-image img')).toBeHidden();
    await page.locator(`[name=${required}]`).fill('Тест');
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL('/profile');
    expect(state.writes).toEqual(['profile']);
  });
}
