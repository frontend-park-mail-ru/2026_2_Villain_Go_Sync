import { test, expect } from '@playwright/test';

/**
 * Настраивает ответы API и позволяет менять состояние во время сценария.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string|null} role Роль или гость.
 * @returns {Promise<object>} Состояние API.
 */
async function fixture(page, role = 'seeker') {
  const state = { role, meStatus: 200, requests: [], delay: 0, registerStatus: 200, refreshStatus: 200, title: 'R&amp;D', salaryFrom: 0, salaryTo: 0, company: 'Компания', letter: '', status: 'future_status' };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push({ path, method: request.method(), body: request.postData() });
    if (path.endsWith('/logo') || path.endsWith('/avatar')) { return route.fulfill({ status: 404 }); }
    if (path === '/api/me') {
      if (state.meStatus === 'offline') { return route.abort(); }
      const status = role === null ? 401 : state.meStatus;
      return route.fulfill({ status, json: status === 200 ? { data: { id: 5, role } } : { error: 'unauthorized' } });
    }
    if (path === '/api/refresh') { return route.fulfill({ status: role === null ? 401 : state.refreshStatus, json: { error: 'expired' } }); }
    if (path === '/api/register') {
      if (state.delay) { await new Promise((resolve) => setTimeout(resolve, state.delay)); }
      return route.fulfill({ status: state.registerStatus, json: { error: 'failed' } });
    }
    let data = [];
    if (path.startsWith('/api/seekers/') || path.startsWith('/api/employers/')) {
      data = { user_id: Number(path.split('/')[3]), first_name: 'Иван', last_name: 'Петров', phone: '', website: 'https://example.com', company_name: state.company, description: '' };
    } else if (path === '/api/vacancies/1') {
      data = { id: 1, employer_id: 4, company_name: state.company, title: state.title, description: state.title, salary_from: state.salaryFrom, salary_to: state.salaryTo, currency: 'RUB' };
    } else if (path === '/api/resumes') { data = [{ id: 1, seeker_id: 5, title: state.title }]; }
    else if (path === '/api/resumes/1') { data = { id: 1, seeker_id: 5, title: state.title, description: '' }; }
    else if (path === '/api/employer/applications') { data = [{ first_name: 'Иван', last_name: 'Петров', status: state.status, resume_id: 1, vacancy_title: state.title, resume_title: state.title, cover_letter: state.letter }]; }
    return route.fulfill({ json: { data } });
  });
  return state;
}

for (const email of ['.qa@example.com', 'qa..name@example.com', 'qa.@example.com', 'qa@-example.com', 'qa@example-.com', 'qa@example..com', `${'a'.repeat(65)}@example.com`]) {
  test(`регистрация блокирует невалидную почту ${email}`, async ({ page }) => {
    const state = await fixture(page, null);
    await page.goto('/register');
    await page.locator('[name=email]').fill(email);
    await page.locator('[name=password]').fill('Password123');
    await page.locator('label[for=register-role-seeker]').click();
    await page.locator('button[type=submit]').click();
    await expect(page.locator('[name=email]')).toHaveAttribute('aria-invalid', 'true');
    expect(state.requests.some((request) => request.path === '/api/register')).toBe(false);
  });
}

for (const website of ['https://example..com', 'https://example.com@evil.test', 'javascript:alert(1)']) {
  test(`профиль блокирует неподходящий сайт ${website}`, async ({ page }) => {
    const state = await fixture(page, 'employer');
    await page.goto('/profile/edit');
    await page.locator('[name=website]').fill(website);
    await page.locator('button[type=submit]').click();
    await expect(page.locator('[name=website]')).toHaveAttribute('aria-invalid', 'true');
    expect(state.requests.some((request) => request.method === 'PUT')).toBe(false);
  });
}

for (const [route, role, field] of [['/resumes/new', 'seeker', 'title'], ['/vacancies/new', 'employer', 'title'], ['/profile/edit', 'seeker', 'firstName']]) {
  test(`форма подтверждает уход по ссылке: ${route}`, async ({ page }) => {
    await fixture(page, role);
    await page.goto(route);
    await page.locator(`[name=${field}]`).fill('Несохранённый текст');
    await page.locator('.header__logo').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Остаться', exact: true }).click();
    await expect(page).toHaveURL(route);
    await expect(page.locator(`[name=${field}]`)).toHaveValue('Несохранённый текст');
    await page.locator('.header__logo').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(page).toHaveURL('/');
  });

  test(`невидимое обязательное поле: ${route}`, async ({ page }) => {
    const state = await fixture(page, role);
    await page.goto(route);
    await page.locator(`[name=${field}]`).fill('\u200b\u200b');
    await page.locator('button[type=submit]').click();
    await expect(page.locator(`[name=${field}]`)).toHaveAttribute('aria-invalid', 'true');
    expect(state.requests.some((request) => ['POST', 'PUT'].includes(request.method))).toBe(false);
  });
}

test('Назад/Вперёд сохраняют согласованность адреса и формы при отмене перехода', async ({ page }) => {
  await fixture(page);
  await page.goto('/resumes');
  await page.getByRole('link', { name: 'Создать резюме', exact: true }).first().click();
  await page.locator('[name=title]').fill('Черновик');
  await page.evaluate(() => history.back());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL('/resumes/new');
  await page.getByRole('dialog').getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page).toHaveURL('/resumes/new');
  await expect(page.locator('[name=title]')).toHaveValue('Черновик');
  await page.evaluate(() => history.back());
  await page.getByRole('dialog').getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page).toHaveURL('/resumes');
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL('/resumes/new');
  await expect(page.locator('[name=title]')).toHaveValue('');
});

test('перезагрузка изменённой формы вызывает системное подтверждение', async ({ page }) => {
  await fixture(page);
  await page.goto('/resumes/new');
  await page.locator('[name=title]').fill('Черновик');
  const dialogPromise = page.waitForEvent('dialog');
  const reload = page.reload({ timeout: 3000 }).catch(() => {});
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await expect(page.locator('[name=title]')).toHaveValue('Черновик');
});

test('Вперёд с изменённой формы можно отменить и затем подтвердить', async ({ page }) => {
  await fixture(page);
  await page.goto('/resumes');
  await page.getByRole('link', { name: 'Создать резюме', exact: true }).first().click();
  await expect(page.locator('[name=title]')).toBeVisible();
  await page.locator('.header__logo').click();
  await expect(page).toHaveURL('/');
  await page.evaluate(() => history.back());
  await expect(page.locator('[name=title]')).toBeVisible();
  await page.locator('[name=title]').fill('Черновик');
  await page.evaluate(() => history.forward());
  await page.getByRole('dialog').getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page).toHaveURL('/resumes/new');
  await expect(page.locator('[name=title]')).toHaveValue('Черновик');
  await page.evaluate(() => history.forward());
  await page.getByRole('dialog').getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('ошибка сервера при refresh не уничтожает состояние формы и входа', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/profile/edit');
  await page.locator('[name=firstName]').fill('Новое имя');
  state.refreshStatus = 500;
  await page.route('**/api/profile/seeker', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('Не удалось сохранить профиль. Попробуйте ещё раз')).toBeVisible();
  await expect(page).toHaveURL('/profile/edit');
  await expect(page.locator('[name=firstName]')).toHaveValue('Новое имя');
  await expect(page.locator('.header__avatar')).toBeVisible();
});

for (const failure of [500, 'offline']) {
  test(`сбой проверки сессии ${failure}: повтор без ложного выхода`, async ({ page }) => {
    const state = await fixture(page);
    state.meStatus = failure;
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Не удалось проверить вход' })).toBeVisible();
    await expect(page).toHaveURL('/profile');
    state.meStatus = 200;
    await page.locator('[data-session-retry]').click();
    await expect(page.locator('.profile__name')).toHaveText('Иван Петров');
  });
}

test('декодирование текста не превращает его в HTML и не затрагивает сырое письмо', async ({ page }) => {
  const state = await fixture(page, 'employer');
  state.title = '&lt;img src=x onerror="window.qaXSS=1"&gt;';
  state.letter = '&amp; — исходный текст письма';
  await page.goto('/applicants');
  await expect(page.locator('.applicant-card__detail').first()).toHaveText('Вакансия: <img src=x onerror="window.qaXSS=1">');
  await page.locator('summary').click();
  await expect(page.locator('.applicant-card__letter p')).toHaveText(state.letter);
  expect(await page.evaluate(() => window.qaXSS)).toBeUndefined();
  await expect(page.locator('.applicant-card__status')).toHaveText('Неизвестный статус');
});

test('R&D отображается и редактируется обычным текстом', async ({ page }) => {
  await fixture(page);
  await page.goto('/resumes/1');
  await expect(page.locator('.detail__name')).toHaveText('R&D');
  await page.getByRole('link', { name: 'Редактировать резюме' }).click();
  await expect(page.locator('[name=title]')).toHaveValue('R&D');
});

for (const [from, to, expected] of [[0, 0, '0 ₽'], [0, null, 'От 0 ₽'], [null, 0, 'До 0 ₽'], [null, null, 'Зарплата не указана']]) {
  test(`зарплата ${from}–${to}`, async ({ page }) => {
    const state = await fixture(page);
    state.salaryFrom = from;
    state.salaryTo = to;
    await page.goto('/vacancies/1');
    await expect(page.locator('.detail__salary')).toHaveText(expected);
  });
}

for (const width of [320, 375, 768, 1440]) {
  test(`вакансия с длинной компанией помещается на ${width}px`, async ({ page }) => {
    const state = await fixture(page);
    state.company = 'ОченьДлинноеНазваниеКомпанииБезПробелов'.repeat(30);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/vacancies/1');
    await expect(page.locator('.detail__subtitle')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('слишком большое письмо остаётся в форме и не отправляется', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/vacancies/1');
  await page.getByRole('button', { name: 'Откликнуться', exact: true }).click();
  await page.locator('[name=coverLetter]').fill('Я'.repeat(10001));
  await page.getByRole('dialog').getByRole('button', { name: 'Откликнуться', exact: true }).click();
  await expect(page.locator('[name=coverLetter]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Сократите письмо до 10 000 символов')).toBeVisible();
  expect(state.requests.some((request) => request.path.endsWith('/applications'))).toBe(false);
  await page.locator('[name=coverLetter]').fill('Я'.repeat(10000));
  await page.getByRole('dialog').getByRole('button', { name: 'Откликнуться', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.requests.filter((request) => request.path.endsWith('/applications'))).toHaveLength(1);
});

test('переключатель пароля сообщает актуальное действие', async ({ page }) => {
  await fixture(page, null);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Показать пароль' }).click();
  await expect(page.locator('[name=password]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Скрыть пароль' }).click();
  await expect(page.locator('[name=password]')).toHaveAttribute('type', 'password');
});

test('ошибка ушедшей регистрации не появляется на главной', async ({ page }) => {
  const state = await fixture(page, null);
  state.delay = 300;
  state.registerStatus = 500;
  await page.goto('/register');
  await page.locator('[name=email]').fill('qa@example.com');
  await page.locator('[name=password]').fill('Password123');
  await page.locator('label[for=register-role-seeker]').click();
  const response = page.waitForResponse((reply) => reply.url().endsWith('/register') && reply.status() === 500);
  await page.locator('button[type=submit]').click();
  await page.locator('.header__logo').click();
  await response;
  await expect(page).toHaveURL('/');
  await expect(page.locator('.toast_error')).toHaveCount(0);
});
