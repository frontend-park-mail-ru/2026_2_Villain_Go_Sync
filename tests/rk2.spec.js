import { saveEditor } from './editor-steps.js';
import { test, expect } from '@playwright/test';

/**
 * Подменяет API состоянием для независимой проверки сценариев РК2.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string} role Роль пользователя.
 * @returns {Promise<object>} Состояние запросов.
 */
async function mockAPI(page, role) {
  const state = { documents: [], applications: [], applicants: [], appliedVacancies: [], writes: [] };
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
      state.appliedVacancies.push({ vacancy_id: Number(path.split('/')[3]) });
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
    } else if (path === '/api/vacancy-categories') { data = [{ id: 12, name: 'Разработка' }]; }
    else if (path === '/api/employer/applications/1/status' && method === 'PATCH') {
      const { status, reason_code, comment } = request.postDataJSON();
      data = { status, reason_code, status_comment: comment };
      Object.assign(state.applicants[0], data);
    } else if (path === '/api/seeker/applications') { data = state.appliedVacancies; }
    else if (path === '/api/employer/applications') { data = state.applicants; }
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

test('резюме сохраняет должность, условия и проекты из черновика', async ({ page }) => {
  const state = await mockAPI(page, 'seeker');
  await page.goto('/resumes/new');
  await page.locator('[name=title]').fill('Моё резюме');
  const step = page.locator('[data-step]');
  await step.nth(2).click();
  await expect(page.locator('[name=target_position]')).toBeFocused();
  await page.locator('[name=target_position]').fill('Разработчик');
  await page.locator('[name=work_format]').selectOption('remote');
  await page.locator('[name=city]').fill('Казань');
  await step.nth(2).click();
  await page.locator('[name=skills]').fill('Go, TypeScript');
  await page.getByRole('button', { name: 'Добавить проект' }).click();
  await page.locator('[data-record-field=title]').fill('Каталог');
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await page.reload();
  await step.nth(2).click();
  await expect(page.locator('[data-record-field=title]')).toHaveValue('Каталог');
  await step.last().click();
  await page.locator('.edit-form button[type=submit]').click();
  await expect(page).toHaveURL('/resumes/9');
  expect(state.documents[0]).toMatchObject({ city: 'Казань', work_format: 'remote', target_position: 'Разработчик',
    skills: [{ name: 'Go' }, { name: 'TypeScript' }], projects: [{ title: 'Каталог' }] });
  await expect(page.locator('#page')).toContainText('Каталог');
});

test('вакансия сохраняет направления и обязательные условия', async ({ page }) => {
  const state = await mockAPI(page, 'employer');
  await page.goto('/vacancies/new');
  await page.locator('[name=title]').fill('Разработчик');
  await page.locator('[data-category-select]').selectOption('12');
  const step = page.locator('[data-step]');
  await step.last().click();
  await expect(page.locator('[name=responsibilities]')).toBeFocused();
  await page.locator('[name=responsibilities]').fill('Писать код');
  await page.locator('[name=requirements]').fill('Знание Go');
  await step.last().click();
  await page.locator('.edit-form button[type=submit]').click();
  await expect(page).toHaveURL('/vacancies/9');
  expect(state.documents[0]).toMatchObject({ category_ids: [12], responsibilities: 'Писать код', requirements: 'Знание Go' });
});

test('причина отказа сохраняется и карточка переходит в другой этап', async ({ page }) => {
  const state = await mockAPI(page, 'employer');
  state.applicants = [{ application_id: 1, vacancy_id: 7, vacancy_title: 'Разработчик', resume_id: null, resume_title: 'Архивное резюме',
    first_name: 'Анна', last_name: 'Иванова', status: 'reviewing', applied_at: '2026-11-20' }];
  await page.goto('/applicants');
  await page.locator('.pipeline_viewed [data-candidate]').dragTo(page.locator('.pipeline_rejected'));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Архивное резюме' })).toHaveCount(0);
  await expect(dialog.locator('[name=status]')).toHaveValue('rejected');
  await dialog.getByRole('button', { name: 'Сохранить этап' }).click();
  expect(state.writes).toEqual([]);
  await dialog.locator('[name=reason]').selectOption('skills_mismatch');
  await dialog.locator('[name=comment]').fill('Требуется опыт с Go');
  await dialog.getByRole('button', { name: 'Сохранить этап' }).click();
  await expect(page.locator('.pipeline_rejected')).toContainText('Анна Иванова');
  await page.reload();
  await page.locator('.pipeline_rejected [data-preview]').click();
  await expect(dialog.locator('[name=reason]')).toHaveValue('skills_mismatch');
  await expect(dialog.locator('[name=comment]')).toHaveValue('Требуется опыт с Go');
});

test('поиск по городу и формату включает вакансии со следующей страницы API', async ({ page }) => {
  await mockAPI(page, 'seeker');
  const cursor = 'next+/=';
  await page.route('**/api/vacancies*', (route) => {
    const next = new URL(route.request().url()).searchParams.get('cursor');
    const item = next === cursor ? { id: 2, title: 'Аналитик', city: 'Казань', work_format: 'remote' }
      : { id: 1, title: 'Инженер', city: 'Москва', work_format: 'office' };
    return route.fulfill({ json: { data: { items: [item], pagination: { next_cursor: next ? null : cursor, total: 2, limit: 1 } } } });
  });
  await page.goto('/');
  await expect(page.locator('.vacancy-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByLabel('Удалённо').check();
  await page.getByLabel('Город').fill('каз');
  await page.getByRole('button', { name: 'Показать вакансии' }).click();
  await expect(page.locator('.vacancy-card')).toHaveCount(1);
  await expect(page.locator('.vacancy-card')).toContainText('Аналитик');
});

test('категория из справочника сочетается с поиском и фильтром зарплаты', async ({ page }) => {
  const state = await mockAPI(page, 'seeker');
  await page.route('**/api/vacancy-categories', (route) => route.fulfill({ json: {
    data: [{ id: 1, name: 'ИТ' }, { id: 2, name: 'Финансы' }, { id: 3, name: 'Образование' }],
  } }));
  state.documents = [
    { id: 1, title: 'Аналитик платформы', categories: ['ит'], salary_from: 200000, currency: 'RUB' },
    { id: 2, title: 'Аналитик данных', categories: ['ИТ'], salary_from: 90000, salary_to: 110000, currency: 'RUB' },
    { id: 3, title: 'Аналитик банка', description: 'Кредиты', categories: ['Финансы'], salary_from: 210000, currency: 'RUB' },
    { id: 4, title: 'Аналитик продукта', categories: ['ИТ-консалтинг'], salary_from: 180000, currency: 'RUB' },
    { id: 5, title: 'Инженер', categories: ['ИТ'], salary_from: 170000, currency: 'RUB' },
  ];

  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Поиск вакансий' });
  const categories = page.getByRole('group', { name: 'Категории вакансий' });
  const it = categories.getByRole('button', { name: 'ИТ', exact: true });
  const titles = page.locator('.vacancy-card__title');
  await search.fill('аналитик');
  await search.press('Enter');
  await it.click();
  await expect(it).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('аналитик');
  await expect(titles).toHaveText(['Аналитик платформы', 'Аналитик данных']);

  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByLabel('От, ₽').fill('150000');
  await page.getByRole('button', { name: 'Показать вакансии' }).click();
  await expect(titles).toHaveText(['Аналитик платформы']);

  await it.click();
  await expect(it).toHaveAttribute('aria-pressed', 'false');
  await expect(search).toHaveValue('аналитик');
  await expect(titles).toHaveText(['Аналитик платформы', 'Аналитик банка', 'Аналитик продукта']);

  const education = categories.getByRole('button', { name: 'Образование', exact: true });
  await education.click();
  await page.getByRole('button', { name: 'Сбросить поиск и фильтры' }).click();
  await expect(education).toHaveAttribute('aria-pressed', 'false');
  await expect(search).toBeEmpty();
  await expect(titles).toHaveCount(5);
});

test('при ошибке справочника каталог загружается, а категории можно запросить повторно', async ({ page }) => {
  const state = await mockAPI(page, 'seeker');
  state.documents = [{ id: 1, title: 'Аналитик', categories: ['Финансы'] }];
  await page.route('**/api/vacancy-categories', (route) => route.fulfill({ json: { data: [{ id: 2, name: 'Финансы' }] } }));
  await page.route('**/api/vacancy-categories', (route) => route.fulfill({ status: 500 }), { times: 1 });
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Аналитик' })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить загрузку категорий' }).click();
  await expect(page.getByRole('button', { name: 'Финансы' })).toBeVisible();
});

for (const [role, resource, listPath, published] of [
  ['employer', 'vacancies', '/my/vacancies', 'Опубликована'],
  ['seeker', 'resumes', '/resumes', 'Опубликовано'],
]) {
  test(`личный список фильтруется по статусу и открывает сохранённый черновик — ${resource}`, async ({ page }) => {
    const state = await mockAPI(page, role);
    state.documents = [{
      id: 9, title: 'Опубликованная запись', employer_id: 5, seeker_id: 5,
      categories: ['Go', 'PostgreSQL', 'SQL', 'API', 'Docker'],
    }];
    await page.goto(`/${resource}/new`);
    await page.locator('[name=title]').fill('Сохранённый вариант');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    const notice = page.getByRole('status').filter({ hasText: 'Черновик сохранён в этой вкладке' });
    await notice.getByRole('button', { name: 'Закрыть' }).click();
    await page.locator('.header__nav').locator(`a[href="${listPath}"]`).click();
    await expect(page).toHaveURL(listPath);

    const draft = page.getByRole('link', { name: 'Сохранённый вариант' });
    const publishedLink = page.getByRole('link', { name: 'Опубликованная запись' });
    await expect(draft).toBeVisible();
    await expect(publishedLink).toBeVisible();
    if (role === 'employer') {
      await expect(page.locator('.vacancy-card_owner .chip')).toHaveText(['Go', 'PostgreSQL', '+3']);
    }

    const filters = page.getByRole('button', { name: 'Фильтры', exact: true });
    const panel = page.getByRole('dialog');
    const apply = panel.getByRole('button', { name: /Показать/ });
    const draftStatus = panel.getByRole('checkbox', { name: 'Черновик' });
    const publishedStatus = panel.getByRole('checkbox', { name: published, exact: true });
    await filters.click();
    await publishedStatus.check();
    await apply.click();
    await expect(publishedLink).toBeVisible();
    await expect(draft).toHaveCount(0);

    await filters.click();
    await publishedStatus.uncheck();
    await draftStatus.check();
    await apply.click();
    await expect(publishedLink).toHaveCount(0);
    await draft.click();
    await expect(page.locator('[name=title]')).toHaveValue('Сохранённый вариант');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(page).toHaveURL(listPath);
    await expect(draft).toBeVisible();

    await page.getByRole('button', { name: 'Удалить черновик «Сохранённый вариант»' }).click();
    await panel.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await expect(publishedLink).toBeVisible();
    expect(state.writes).toEqual([]);
  });
}

test('черновик копии резюме в старом формате открывается без исходного резюме', async ({ page }) => {
  await mockAPI(page, 'seeker');
  await page.goto('/resumes');
  await page.evaluate(() => {
    sessionStorage.setItem('hirenoon:creation:5:/resumes/new?copy=3', JSON.stringify({ title: 'Черновик копии' }));
    sessionStorage.setItem('hirenoon:creation:6:/resumes/new', JSON.stringify({ title: 'Черновик другого пользователя' }));
  });
  await page.reload();
  await expect(page.getByRole('link', { name: 'Черновик другого пользователя' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Черновик копии' }).click();
  await expect(page).toHaveURL('/resumes/new?copy=3');
  await expect(page.locator('[name=title]')).toHaveValue('Черновик копии');
});
