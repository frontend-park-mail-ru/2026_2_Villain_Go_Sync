import { expect, test } from '@playwright/test';

const company = {
  user_id: 8, company_name: 'Пример Плюс', industry: 'ИТ и разработка', main_city: 'Москва',
  description: 'Разрабатываем цифровые платформы', website: 'https://company.example',
  hiring_email: 'career@company.example', technologies: [{ name: 'Go' }],
  culture: [{ title: 'Открытая обратная связь', short_description: 'Работа в командах', description: 'Вместе принимаем решения' }],
};
const seeker = {
  user_id: 7, first_name: 'Анна', last_name: 'Смирнова', city: 'Москва', contact_email: 'contact@example.test',
  email: 'registration@example.test', phone: '+7 900 123-45-67', preferred_position: 'Go-разработчик', work_format: 'hybrid',
  preferred_cities: 'Москва, Санкт-Петербург', skills: [{ name: 'Go' }],
  experience_items: [{ position_title: 'Backend-разработчик', company_name: 'ТехЛаб', started_on: '2023-03-01', is_current: true }],
  education_items: [{ institution: 'Технический университет', completion_year: 2025 }],
  projects: [{ title: 'Портфолио', url: 'https://projects.example' }],
};
const vacancy = { id: 9, employer_id: 8, title: 'Go-разработчик', company_name: company.company_name, salary_from: 220000, currency: 'RUB' };
const resume = { id: 6, seeker_id: 7, title: 'Резюме разработчика', skills: [{ name: 'PostgreSQL' }], experience_items: seeker.experience_items };

/**
 * Подменяет профили, каталог и отклики тестовыми данными.
 * @param {import('@playwright/test').Page} page Страница браузера.
 * @param {string | null} role Роль текущего пользователя.
 * @returns {Promise<{statusUpdates: object[], requests: string[]}>} Запросы для проверки.
 */
async function mockPublicProfiles(page, role) {
  const applicant = {
    application_id: 3, vacancy_id: 9, seeker_id: 7, resume_id: 6, vacancy_title: vacancy.title,
    first_name: seeker.first_name, last_name: seeker.last_name, resume_title: resume.title,
    status: 'reviewing', status_changed_at: '2026-11-13T15:00:00Z', applied_at: '2026-11-12T15:00:00Z',
    cover_letter: 'Здравствуйте! Меня заинтересовала вакансия.',
  };
  const state = { statusUpdates: [], requests: [] };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push(path);
    if (path === '/api/me') {
      return role ? route.fulfill({ json: { data: { id: 5, role } } }) : route.fulfill({ status: 401 });
    }
    if (path === '/api/refresh') { return route.fulfill({ status: 401 }); }
    if (path === '/api/employer/applications/3/status' && request.method() === 'PATCH') {
      const fields = request.postDataJSON();
      state.statusUpdates.push(fields);
      const status = { status: fields.status, reason_code: fields.reason_code, status_comment: fields.comment, status_changed_at: '2026-11-14T15:00:00Z' };
      Object.assign(applicant, status);
      return route.fulfill({ json: { data: status } });
    }
    const responses = {
      '/api/employers/5': { ...company, user_id: 5 },
      '/api/employers/8': company,
      '/api/seekers/7': seeker,
      '/api/employer/applications': [applicant],
      '/api/vacancies/9': vacancy,
      '/api/vacancies': [vacancy, { ...vacancy, id: 10, title: 'Тестировщик' }, { ...vacancy, id: 11, employer_id: 99, title: 'Чужая вакансия' }],
      '/api/vacancy-categories': [],
      '/api/resumes/6': resume,
    };
    return path in responses ? route.fulfill({ json: { data: responses[path] } }) : route.fulfill({ status: 404 });
  });
  return state;
}

test('гость открывает профиль компании из вакансии и переходит к вакансиям этой компании', async ({ page }) => {
  const state = await mockPublicProfiles(page, null);
  await page.goto('/vacancies/9');
  await page.getByRole('link', { name: company.company_name }).click();
  await expect(page).toHaveURL('/employers/8');
  await expect(page.getByRole('heading', { name: 'Профиль компании' })).toBeVisible();
  await expect(page.getByRole('link', { name: company.website })).toHaveAttribute('href', company.website);
  await expect(page.getByRole('heading', { name: 'Открытая обратная связь' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Тестировщик' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Редактировать/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Смотреть все вакансии компании' }).click();
  await expect(page).toHaveURL('/?employer_id=8');
  await expect(page.locator('.vacancy-card__title')).toHaveText([vacancy.title, 'Тестировщик']);
  expect(state.requests).not.toContain('/api/employer/vacancies');
});

test('работодатель открывает профиль соискателя из резюме', async ({ page }) => {
  await mockPublicProfiles(page, 'employer');
  await page.goto('/resumes/6');
  await page.getByRole('link', { name: 'Профиль соискателя' }).click();
  await expect(page).toHaveURL('/seekers/7');
  await expect(page.getByRole('heading', { name: 'Анна Смирнова' })).toBeVisible();
  await expect(page.getByText('contact@example.test')).toBeVisible();
  await expect(page.getByText('registration@example.test')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Технический университет' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Редактировать/ })).toHaveCount(0);
});

test('работодатель открывает подробности отклика, сохраняет заметку и меняет этап', async ({ page }) => {
  const state = await mockPublicProfiles(page, 'employer');
  await page.goto('/applicants');
  await page.getByRole('link', { name: 'Анна Смирнова' }).click();
  await expect(page).toHaveURL('/applicants/3');
  await expect(page.getByRole('heading', { name: 'Анна Смирнова' })).toBeVisible();
  await expect(page.getByText('contact@example.test')).toBeVisible();
  await expect(page.getByText('registration@example.test')).toHaveCount(0);
  await expect(page.getByText('Не указан', { exact: true })).toBeVisible();
  await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();
  await expect(page.getByText(/Начато рассмотрение/)).toBeVisible();

  await page.getByRole('button', { name: 'Редактировать заметку' }).click();
  await page.getByRole('textbox', { name: 'Заметка в этой вкладке' }).fill('Обсудить опыт работы с Go');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Обсудить опыт работы с Go')).toBeVisible();
  expect(state.statusUpdates).toEqual([]);

  await page.getByRole('button', { name: 'Перевести на собеседование' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить этап' }).click();
  await expect(page.getByText(/Переведён на этап собеседования/)).toBeVisible();
  await page.getByRole('button', { name: 'Отказать кандидату' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Причина отказа').selectOption('skills_mismatch');
  await dialog.getByRole('button', { name: 'Сохранить этап' }).click();
  await expect(page.getByText(/Кандидату отказано/)).toBeVisible();
  expect(state.statusUpdates).toEqual([
    { status: 'interview', comment: '' },
    { status: 'rejected', reason_code: 'skills_mismatch', comment: '' },
  ]);
  await page.getByRole('link', { name: 'Вернуться к откликам' }).click();
  await expect(page).toHaveURL('/applicants');
});

test('чужой отклик не открывается и не запрашивает данные кандидата', async ({ page }) => {
  const state = await mockPublicProfiles(page, 'employer');
  await page.goto('/applicants/99');
  await expect(page.getByRole('heading', { name: 'Отклик не найден' })).toBeVisible();
  expect(state.requests).not.toContain('/api/seekers/7');
  expect(state.requests).not.toContain('/api/resumes/6');
});

test('соискатель не может открыть страницы работодателя', async ({ page }) => {
  const state = await mockPublicProfiles(page, 'seeker');
  for (const path of ['/seekers/7', '/applicants/3']) {
    await page.goto(path);
    await expect(page).toHaveURL('/');
  }
  expect(state.requests).not.toContain('/api/seekers/7');
  expect(state.requests).not.toContain('/api/employer/applications');
});

test('действия в подробном отклике помещаются на планшете', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await mockPublicProfiles(page, 'employer');
  await page.goto('/applicants/3');
  const interview = page.getByRole('button', { name: 'Перевести на собеседование' });
  await expect(interview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(820);
  await interview.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
