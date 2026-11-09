import { test, expect } from '@playwright/test';

/**
 * Подменяет профиль и резюме, сохраняя тела запросов только в памяти теста.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} role Роль владельца.
 * @param {boolean} emptyProfile Профиль ещё не создавали.
 * @returns {Promise<object>} Состояние API.
 */
async function setup(page, role = 'seeker', emptyProfile = false) {
  const state = {
    profile: emptyProfile ? null : { user_id: 5, first_name: 'Иван', last_name: 'Петров', phone: '', company_name: 'Компания', website: '', description: '' },
    resume: { id: 9, seeker_id: 5, title: 'Разработчик', description: '', experience: '', education: '' },
    writes: [],
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') { return route.fulfill({ json: { data: { id: 5, role } } }); }
    if (path === '/api/seekers/5' || path === '/api/employers/5') {
      return route.fulfill(state.profile ? { json: { data: state.profile } } : { status: 404, json: { error: 'not found' } });
    }
    if (path === `/api/profile/${role}` && request.method() === 'PUT') {
      const fields = request.postDataJSON();
      state.writes.push({ method: 'PUT', fields });
      state.profile = { ...fields, user_id: 5 };
      return route.fulfill({ json: { data: state.profile } });
    }
    if (/^\/api\/resumes(?:\/9)?$/.test(path) && ['POST', 'PUT'].includes(request.method())) {
      const fields = request.postDataJSON();
      state.writes.push({ method: request.method(), fields });
      state.resume = { ...state.resume, ...fields };
      return route.fulfill({ json: { data: state.resume } });
    }
    if (path === '/api/resumes/9') { return route.fulfill({ json: { data: state.resume } }); }
    return route.fulfill({ json: { data: [] } });
  });
  return state;
}

for (const edit of [false, true]) {
  for (const [name, limit] of [['title', 100], ['description', 10000], ['experience', 5000], ['education', 2000]]) {
    test(`лимит резюме: ${edit ? 'редактирование' : 'создание'}, ${name}`, async ({ page }) => {
      const state = await setup(page);
      await page.goto(edit ? '/resumes/9/edit' : '/resumes/new');
      await page.locator('[name=title]').fill('Разработчик');
      const field = page.locator(`[name=${name}]`);
      const group = field.locator('..');
      await field.fill('Я'.repeat(limit - 1));
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await expect(group.locator('.field__counter')).toHaveText(`${limit - 1} / ${limit} символов`);
      await field.fill('Я'.repeat(limit + 1));
      await page.locator('button[type=submit]').click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(group.locator('.field__message')).toBeVisible();
      expect(await group.locator('.field__message').textContent()).not.toMatch(/\.$/);
      expect(state.writes).toEqual([]);
      await expect(field).toHaveValue('Я'.repeat(limit + 1));
      await page.locator(`[name=${name === 'title' ? 'experience' : 'title'}]`).fill('Другой текст');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await field.fill('Я'.repeat(limit));
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await expect(group.locator('.field__message')).toBeEmpty();
      await page.locator('button[type=submit]').click();
      await expect(page).toHaveURL('/resumes/9');
      expect(state.writes).toHaveLength(1);
      expect(state.writes[0].method).toBe(edit ? 'PUT' : 'POST');
      expect(state.writes[0].fields[name]).toBe('Я'.repeat(limit));
    });
  }
}

for (const emptyProfile of [true, false]) {
  for (const [role, name, apiName, limit] of [
    ['seeker', 'firstName', 'first_name', 100], ['seeker', 'lastName', 'last_name', 100],
    ['seeker', 'description', 'description', 10000],
    ['employer', 'companyName', 'company_name', 200], ['employer', 'description', 'description', 10000],
  ]) {
    test(`лимит профиля: ${emptyProfile ? 'первое заполнение' : 'редактирование'}, ${role}, ${name}`, async ({ page }) => {
      const state = await setup(page, role, emptyProfile);
      await page.goto('/profile/edit');
      await page.locator(role === 'seeker' ? '[name=firstName]' : '[name=companyName]').fill('Тест');
      const field = page.locator(`[name=${name}]`);
      const group = field.locator('..');
      const value = (length) => 'Я'.repeat(length);
      await field.fill(value(limit - 1));
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await field.fill(value(limit + 1));
      await expect(group.locator('.field__counter')).toHaveText(`${limit + 1} / ${limit} символов`);
      await page.locator('button[type=submit]').click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toBeFocused();
      expect(await group.locator('.field__message').textContent()).not.toMatch(/\.$/);
      expect(state.writes).toEqual([]);
      await expect(field).toHaveValue(value(limit + 1));
      await field.fill(value(limit));
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await expect(group.locator('.field__message')).toBeEmpty();
      await page.locator('button[type=submit]').click();
      await expect(page).toHaveURL('/profile');
      expect(state.writes).toHaveLength(1);
      expect(state.writes[0].fields[apiName]).toBe(value(limit));
    });
  }
}

test('резюме: обязательность, пустые необязательные поля и эмодзи', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/resumes/new');
  const title = page.locator('[name=title]');
  await title.fill(' \u200B ');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#resume-title-message')).toHaveText('Введите название резюме');
  await page.locator('[name=description]').fill('Другой текст');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await page.locator('[name=description]').fill('');
  await title.fill('🚀'.repeat(101));
  await expect(page.locator('#resume-title-counter')).toHaveText('101 / 100 символов');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await title.fill('🚀'.repeat(100));
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL('/resumes/9');
  expect(state.writes[0].fields).toEqual({ title: '🚀'.repeat(100), description: '', experience: '', education: '' });
});

test('профиль: обязательность имени, неверный телефон и очистка необязательных полей', async ({ page }) => {
  const state = await setup(page, 'seeker', true);
  await page.goto('/profile/edit');
  await page.locator('[name=phone]').fill('не телефон');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#profile-first-name-message')).toHaveText('Введите имя');
  await expect(page.locator('#profile-phone-message')).toHaveText('Введите корректный номер телефона');
  await page.locator('[name=firstName]').fill('🚀'.repeat(100));
  await page.locator('[name=phone]').fill('');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL('/profile');
  expect(state.writes[0].fields).toEqual({ first_name: '🚀'.repeat(100), last_name: '', phone: '', description: '' });
});

for (const emptyProfile of [true, false]) {
  test(`телефон без счётчика: ${emptyProfile ? 'первое заполнение' : 'редактирование'}`, async ({ page }) => {
    const state = await setup(page, 'seeker', emptyProfile);
    if (!emptyProfile) { state.profile.phone = `+7${' '.repeat(1000)}1234567890123`; }
    await page.goto('/profile/edit');
    const phone = page.locator('[name=phone]');
    await expect(phone.locator('..').locator('.field__counter')).toHaveCount(0);
    await expect(phone).toHaveAttribute('aria-describedby', 'profile-phone-message');
    if (!emptyProfile) {
      await expect(page.locator('#profile-phone-message')).toHaveText('Введите корректный номер телефона');
    }
    await page.locator('[name=firstName]').fill('Иван');
    for (const value of ['123456789', '1234567890123456', 'не телефон', `+7${' '.repeat(16)}1234567890123`, `+7${' '.repeat(1000)}1234567890123`]) {
      await phone.fill(value);
      await expect(phone).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#profile-phone-message')).toHaveText('Введите корректный номер телефона');
      await page.locator('button[type=submit]').click();
      expect(state.writes).toEqual([]);
    }
    for (const value of ['', '1234567890', '+123456789012345', '+7 (999) 123-45-67']) {
      await phone.fill(value);
      await expect(phone).toHaveAttribute('aria-invalid', 'false');
      await expect(page.locator('#profile-phone-message')).toBeEmpty();
    }
    const formatted = `+7${' '.repeat(15)}1234567890123`;
    await phone.fill(formatted);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL('/profile');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].fields.phone).toBe(formatted);
  });
}

for (const emptyProfile of [true, false]) {
  test(`сайт без счётчика: ${emptyProfile ? 'первое заполнение' : 'редактирование'}`, async ({ page }) => {
    const state = await setup(page, 'employer', emptyProfile);
    const prefix = 'https://example.com/?q=';
    const longURL = prefix + 'a'.repeat(256 - prefix.length);
    if (!emptyProfile) { state.profile.website = longURL; }
    await page.goto('/profile/edit');
    const website = page.locator('[name=website]');
    const message = page.locator('#profile-website-message');
    await expect(website.locator('..').locator('.field__counter')).toHaveCount(0);
    await expect(website).toHaveAttribute('aria-describedby', 'profile-website-message');
    if (!emptyProfile) { await expect(message).toHaveText('Введите корректный адрес сайта'); }
    await page.locator('[name=companyName]').fill('Компания');
    const barePrefix = 'example.com/?q=';
    const tooLongWithoutProtocol = barePrefix + 'a'.repeat(248 - barePrefix.length);
    for (const value of ['https://example..com', 'javascript:alert(1)', 'https://user:password@example.com', 'https://example.com/a b', longURL, tooLongWithoutProtocol]) {
      await website.fill(value);
      await expect(website).toHaveAttribute('aria-invalid', 'true');
      await expect(message).toHaveText('Введите корректный адрес сайта');
      await page.locator('button[type=submit]').click();
      expect(state.writes).toEqual([]);
      await expect(website).toHaveValue(value);
    }
    const longestWithoutProtocol = barePrefix + 'a'.repeat(247 - barePrefix.length);
    for (const value of ['', 'example.com', 'http://example.com/path', 'https://пример.рф', longestWithoutProtocol]) {
      await website.fill(value);
      await expect(website).toHaveAttribute('aria-invalid', 'false');
      await expect(message).toBeEmpty();
    }
    const valid = prefix + 'a'.repeat(255 - prefix.length);
    await website.fill(valid);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL('/profile');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].fields.website).toBe(valid);
  });
}

for (const resource of ['profile', 'resume']) {
  test(`старые длинные данные не обрезаются: ${resource}`, async ({ page }) => {
    const state = await setup(page);
    state[resource].description = 'Я'.repeat(10001);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(resource === 'profile' ? '/profile/edit' : '/resumes/9/edit');
    const description = page.locator('[name=description]');
    await expect(description).toHaveValue('Я'.repeat(10001));
    await expect(description).toHaveAttribute('aria-invalid', 'true');
    await page.locator('button[type=submit]').click();
    expect(state.writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}
