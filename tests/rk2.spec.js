import { saveEditor } from './editor-steps.js';
import { test, expect } from '@playwright/test';

/**
 * Подменяет API состоянием для независимой проверки сценариев РК2.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} role Роль пользователя.
 * @returns {Promise<object>} Состояние запросов.
 */
async function mockAPI(page, role) {
  const state = { documents: [], applications: [], applicants: [], writes: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let data = [];
    if (path.endsWith('/avatar') || path.endsWith('/logo')) { return route.fulfill({ status: 404 }); }
    if (path === '/api/me') { data = { id: 5, role }; }
    else if (path.startsWith('/api/seekers/') || path.startsWith('/api/employers/')) {
      data = { user_id: 5, first_name: 'Иван', last_name: 'Петров', company_name: 'Компания', phone: '+79990000000', website: 'https://example.com', description: 'Описание профиля' };
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
    } else if (path === '/api/employer/applications') { data = state.applicants; }
    else if (path === '/api/employer/vacancies') { data = state.documents; }
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
    await saveEditor(page);
    await expect(page.getByText(role === 'seeker' ? 'Введите название резюме' : 'Введите название вакансии')).toBeVisible();
    expect(state.writes).toHaveLength(0);
    await page.locator('[name="title"]').fill('Первое название');
    await page.locator('[data-step]').nth(2).click();
    await page.locator('[name="description"]').fill('Описание документа');
    await saveEditor(page);
    await expect(page).toHaveURL(`/${resource}/9`);
    await page.getByRole('link', { name: role === 'seeker' ? 'Редактировать резюме' : 'Редактировать вакансию' }).click();
    await page.locator('[name="title"]').fill('Обновлённое название');
    await saveEditor(page);
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
  await page.reload();
  await expect(page.getByRole('button', { name: 'Вы уже откликнулись' })).toBeDisabled();
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


test('каталог фильтрует зарплату, сбрасывает фильтр и запоминает избранное', async ({ page }) => {
  const state = await mockAPI(page, 'seeker');
  state.documents = [
    { id: 1, title: 'Аналитик', company_name: 'Команда', salary_from: 90000, salary_to: 120000, currency: 'RUB' },
    { id: 2, title: 'Разработчик', company_name: 'Команда', salary_from: 190000, salary_to: null, currency: 'RUB' },
  ];
  await page.goto('/');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByLabel('От, ₽').fill('150000');
  await page.getByRole('button', { name: 'Показать вакансии' }).click();
  await expect(page.locator('.vacancy-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Разработчик' })).toBeVisible();
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.locator('.vacancy-card')).toHaveCount(2);
  await page.locator('[data-favorite="2"]').click();
  await page.reload();
  await expect(page.locator('[data-favorite="2"]')).toHaveAttribute('aria-pressed', 'true');
});

test('копия резюме восстанавливает свой черновик отдельно от нового резюме', async ({ page }) => {
  const state = await mockAPI(page, 'seeker');
  state.documents = [{ id: 4, seeker_id: 5, title: 'Исходное резюме', description: 'О себе' }];
  await page.goto('/resumes/4');
  await page.getByRole('link', { name: 'Дублировать' }).click();
  await expect(page.locator('[name=title]')).toHaveValue('Исходное резюме');
  await page.locator('[name=title]').fill('Новая версия');
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await page.reload();
  await expect(page.locator('[name=title]')).toHaveValue('Новая версия');
  await page.goto('/resumes/new');
  await expect(page.locator('[name=title]')).toBeEmpty();
  await page.getByRole('button', { name: 'Заполнить из профиля' }).click();
  await expect(page.locator('[name=description]')).toHaveValue('Описание профиля');
  expect(state.writes).toEqual([]);
});

test('отклики переключаются между видами и открывают соответствующее письмо', async ({ page }) => {
  const state = await mockAPI(page, 'employer');
  state.documents = [{ id: 4, seeker_id: 7, title: 'Резюме разработчика', experience: 'Опыт разработки' }];
  state.applicants = [
    { application_id: 1, vacancy_id: 9, vacancy_title: 'Разработчик', resume_id: 4, resume_title: 'Резюме разработчика',
      first_name: 'Анна', last_name: 'Иванова', status: 'created', cover_letter: 'Интересует вакансия', applied_at: '2026-11-20' },
    { application_id: 2, vacancy_id: 8, vacancy_title: 'Аналитик', resume_id: 4, resume_title: 'Резюме аналитика',
      first_name: 'Иван', last_name: 'Петров', status: 'interview', cover_letter: null, applied_at: '2026-11-19' },
  ];
  await page.goto('/applicants');
  await expect(page.locator('.pipeline_new')).toContainText('Анна Иванова');
  await page.locator('.pipeline_new [data-preview]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Интересует вакансия');
  await expect(dialog).toContainText('Опыт разработки');
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  await page.getByLabel('Вакансия', { exact: true }).selectOption('8');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Подробнее' }).click();
  await expect(dialog).toContainText('Иван Петров');
  await expect(dialog.getByRole('heading', { name: 'Сопроводительное письмо' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Карточки' }).click();
  await expect(page.locator('.applicant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.locator('.applicant-card')).toHaveCount(2);
});
