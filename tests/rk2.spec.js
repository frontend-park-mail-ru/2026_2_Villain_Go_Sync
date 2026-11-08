import { test, expect } from '@playwright/test';

/**
 * Подменяет API состоянием для независимой проверки сценариев РК2.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} role Роль пользователя.
 * @returns {Promise<object>} Состояние запросов.
 */
async function mockAPI(page, role) {
  const state = { documents: [], applications: [], writes: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let data = [];
    if (path.endsWith('/avatar') || path.endsWith('/logo')) { return route.fulfill({ status: 404 }); }
    if (path === '/api/me') { data = { id: 5, role }; }
    else if (path.startsWith('/api/seekers/') || path.startsWith('/api/employers/')) {
      data = { first_name: 'Иван', last_name: 'Петров', company_name: 'Компания', phone: '+79990000000', website: 'https://example.com', description: 'Описание профиля' };
    } else if (path.endsWith('/applications') && method === 'POST') {
      state.applications.push(request.postDataJSON());
    } else if (/\/api\/(vacancies|resumes)/.test(path)) {
      const id = Number(path.split('/')[3]);
      if (method === 'POST') {
        data = { ...request.postDataJSON(), id: 9, seeker_id: 5, employer_id: 5, company_name: 'Компания', created_at: '2026-11-07' };
        state.documents.push(data);
      } else if (method === 'PUT' || method === 'PATCH') {
        data = { ...state.documents[0], ...request.postDataJSON() };
        state.documents[0] = data;
      } else if (method === 'DELETE') { state.documents = []; }
      else if (id) { data = state.documents.find((item) => item.id === id); }
      else { data = state.documents; }
    } else if (path === '/api/employer/vacancies') { data = state.documents; }
    if (method !== 'GET') { state.writes.push({ path, method }); }
    return route.fulfill({ json: { data } });
  });
  return state;
}

for (const role of ['seeker', 'employer']) {
  test(`РК2: создание, редактирование и удаление ${role}`, async ({ page }) => {
    const resource = role === 'seeker' ? 'resumes' : 'vacancies';
    const state = await mockAPI(page, role);
    await page.goto(`/${resource}/new`);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(role === 'seeker' ? 'Введите название резюме.' : 'Введите название вакансии.')).toBeVisible();
    expect(state.writes).toHaveLength(0);
    await page.locator('[name="title"]').fill('Первое название');
    await page.locator('[name="description"]').fill('Описание документа');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`/${resource}/9`);
    await page.getByRole('link', { name: role === 'seeker' ? 'Редактировать резюме' : 'Редактировать вакансию' }).click();
    await page.locator('[name="title"]').fill('Обновлённое название');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: 'Обновлённое название', exact: true })).toBeVisible();
    await page.getByRole('button', { name: role === 'seeker' ? 'Удалить резюме' : 'Удалить вакансию', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
    expect(state.documents).toHaveLength(1);
    await page.getByRole('button', { name: role === 'seeker' ? 'Удалить резюме' : 'Удалить вакансию', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page).toHaveURL(role === 'seeker' ? '/resumes' : '/my/vacancies');
    expect(state.documents).toHaveLength(0);
    expect(state.writes.map(({ method }) => method)).toEqual(['POST', role === 'seeker' ? 'PUT' : 'PATCH', 'DELETE']);
  });
}

test('РК2: отправка отклика с выбранным резюме', async ({ page }) => {
  const state = await mockAPI(page, 'seeker');
  state.documents = [{ id: 9, employer_id: 4, seeker_id: 5, title: 'Frontend', company_name: 'Компания', salary_from: null, salary_to: null }];
  await page.goto('/vacancies/9');
  await page.getByRole('button', { name: 'Откликнуться', exact: true }).click();
  await page.locator('[name="coverLetter"]').fill('Здравствуйте!');
  await page.getByRole('dialog').getByRole('button', { name: 'Откликнуться', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.applications).toEqual([{ resume_id: 9, cover_letter: 'Здравствуйте!' }]);
});

for (const width of [320, 360, 1440]) {
  test(`РК2: страницы без горизонтального переполнения ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mockAPI(page, 'employer');
    state.documents = [{ id: 9, employer_id: 5, seeker_id: 5, company_name: 'Компания', title: 'Разработчик интерфейсов', description: 'Описание документа', created_at: '2026-11-07' }];
    for (const path of ['/', '/profile', '/profile/edit', '/vacancies/new', '/vacancies/9', '/my/vacancies', '/applicants']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#page .skeleton')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
      if (path === '/profile' || path === '/') {
        await page.screenshot({ path: testInfo.outputPath(`${path === '/' ? 'vacancies' : 'profile'}-${width}.png`), fullPage: true });
      }
    }
  });
}
