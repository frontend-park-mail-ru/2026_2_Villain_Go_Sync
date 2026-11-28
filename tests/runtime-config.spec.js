import { expect, test } from '@playwright/test';

/**
 * Подменяет продуктовый API, сохраняя настоящие маршруты и формы.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {'seeker'|'employer'} role Роль первого пользователя.
 * @returns {Promise<object>} Настройки и счётчики запросов.
 */
async function setup(page, role) {
  const state = {
    user: { id: 5, role },
    runtimeStatus: 200,
    limit: 3,
    creation: true,
    applications: true,
    rejectWrites: false,
    polls: [],
    writes: [],
  };
  const vacancy = {
    id: 9, employer_id: 5, company_name: 'Компания', title: 'Разработчик', description: 'Работа в команде',
    salary_from: null, salary_to: null, currency: 'RUB', categories: ['Категория 1', 'Категория 2', 'Категория 3'],
  };
  await page.clock.install();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let status = 200;
    let json = { data: [] };
    if (pathname === '/api/me') {
      json = state.user ? { data: state.user } : { error: 'unauthorized' };
      status = state.user ? 200 : 401;
    } else if (pathname === '/api/logout') {
      state.user = null;
    } else if (pathname === '/api/login') {
      state.user = { id: 6, role };
    } else if (pathname === '/api/refresh' && !state.user) {
      status = 401;
      json = { error: 'unauthorized' };
    } else if (pathname === '/api/runtime-config') {
      state.polls.push(state.user?.id);
      status = state.runtimeStatus;
      json = status === 200
        ? {
          data: {
            configs: { 'vacancy.max_categories': state.limit },
            flags: { 'vacancy.creation_enabled': state.creation, 'application.applications_enabled': state.applications },
          },
        }
        : { error: 'dependency unavailable' };
    } else if (pathname === '/api/vacancy-categories') {
      json = { data: [1, 2, 3, 4].map((id) => ({ id, name: `Категория ${id}` })) };
    } else if (pathname === '/api/employers/5' || pathname === '/api/employers/6') {
      json = { data: { user_id: Number(pathname.split('/').pop()), company_name: 'Компания' } };
    } else if (pathname === '/api/resumes') {
      json = { data: [{ id: 21, title: 'Резюме' }] };
    } else if ((pathname === '/api/vacancies' && request.method() === 'POST')
      || (pathname === '/api/vacancies/9' && request.method() === 'PATCH')
      || (pathname === '/api/vacancies/9/applications' && request.method() === 'POST')) {
      state.writes.push(request.postDataJSON());
      status = state.rejectWrites ? 403 : 200;
      json = state.rejectWrites ? { error: 'feature disabled' } : { data: vacancy };
    } else if (pathname === '/api/vacancies/9') {
      json = { data: { ...vacancy, employer_id: role === 'employer' ? 5 : 8 } };
    }
    await route.fulfill({ status, json });
  });
  return state;
}

/**
 * Доводит опрос настроек до следующего 15-секундного интервала.
 * @param {import('@playwright/test').Page} page Страница браузера.
 */
async function poll(page) {
  const response = page.waitForResponse('**/api/runtime-config');
  await page.clock.runFor(15_000);
  await response;
}

/**
 * Заполняет обязательные поля формы вакансии и открывает финальный шаг.
 * @param {import('@playwright/test').Page} page Страница браузера.
 */
async function openReview(page) {
  await page.locator('.edit-form').evaluate((form) => {
    for (const [name, value] of Object.entries({ description: 'Разрабатываем продукт', responsibilities: 'Разработка', requirements: 'Опыт работы' })) {
      const field = form.elements.namedItem(name);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.locator('[data-step]').last().click();
}

test('runtime-config меняет лимит и доступность публикации без очистки формы', async ({ page }) => {
  const state = await setup(page, 'employer');
  await page.goto('/vacancies/new');
  const hint = page.locator('[data-category-hint]');
  const categories = page.locator('[data-category-select]');
  const title = page.locator('#vacancy-title');
  const notice = page.locator('[data-vacancy-creation-notice]');
  const publish = page.getByRole('button', { name: 'Опубликовать вакансию' });
  await expect(hint).toHaveText('Выбрано 0 из 3.');
  await title.fill('Мой черновик');
  await categories.selectOption(['1', '2', '3']);

  state.limit = 1;
  state.creation = false;
  await poll(page);
  await expect(hint).toHaveText('Выбрано 3. Сократите число направлений до 1.');
  await expect(categories).toHaveValues(['1', '2', '3']);
  await expect(title).toHaveValue('Мой черновик');
  await expect(notice).toHaveText('Создание вакансий временно недоступно');
  await expect(page.getByRole('button', { name: 'Далее →' })).toBeEnabled();
  await categories.selectOption(['1']);
  await openReview(page);
  await expect(publish).toBeDisabled();

  state.runtimeStatus = 503;
  await poll(page);
  await expect(publish).toBeDisabled();
  state.runtimeStatus = 200;
  state.creation = true;
  await poll(page);
  await expect(publish).toBeEnabled();
  state.rejectWrites = true;
  await publish.click();
  await expect(publish).toBeDisabled();
  await expect(notice).toBeVisible();
  await expect(title).toHaveValue('Мой черновик');
  expect(state.writes).toHaveLength(1);
});

test('уменьшенный лимит оставляет сохранённые категории вакансии при редактировании', async ({ page }) => {
  const state = await setup(page, 'employer');
  state.limit = 1;
  state.creation = false;
  await page.goto('/vacancies/9/edit');
  await expect(page.locator('[data-category-hint]')).toContainText('Сохранённые направления можно оставить');
  await expect(page.locator('[data-category-select]')).toHaveValues(['1', '2', '3']);
  await openReview(page);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL('/vacancies/9');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).not.toHaveProperty('category_ids');
});

test('флаг откликов и серверный 403 сохраняют письмо в открытом диалоге', async ({ page }) => {
  const state = await setup(page, 'seeker');
  await page.goto('/vacancies/9');
  const apply = page.locator('[data-action="apply"]');
  await apply.click();
  const dialog = page.getByRole('dialog', { name: 'Откликнуться на вакансию' });
  const letter = dialog.getByRole('textbox', { name: 'Сопроводительное письмо' });
  const send = dialog.getByRole('button', { name: 'Откликнуться' });
  await letter.fill('Текст моего письма');
  state.applications = false;
  await poll(page);
  await expect(send).toBeDisabled();
  await expect(letter).toHaveValue('Текст моего письма');
  await expect(dialog.getByRole('status')).toHaveText('Отклики временно недоступны');

  state.applications = true;
  await poll(page);
  await expect(send).toBeEnabled();
  state.rejectWrites = true;
  await send.click();
  await expect(send).toBeDisabled();
  await expect(letter).toHaveValue('Текст моего письма');
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(apply).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});

test('после выхода опрос останавливается, а следующий пользователь начинает с дефолтов', async ({ page }) => {
  const state = await setup(page, 'employer');
  state.creation = false;
  await page.goto('/my/vacancies');
  const create = page.locator('[data-vacancy-create]');
  await expect(create).toBeHidden();
  await expect(page.locator('[data-vacancy-creation-notice]')).toBeVisible();
  await page.getByRole('button', { name: 'Меню профиля' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.clock.runFor(30_000);
  expect(state.polls).toEqual([5]);

  state.runtimeStatus = 503;
  await page.locator('[name="email"]').fill('second@example.com');
  await page.locator('[name="password"]').fill('password');
  await page.locator('.auth__form [type="submit"]').click();
  await page.getByRole('link', { name: 'Мои вакансии' }).click();
  await expect(create).toBeVisible();
  expect(state.polls).toEqual([5, 6]);
});
