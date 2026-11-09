import { test, expect } from '@playwright/test';

test('отклики открывают приложенное резюме без запросов по каждой вакансии', async ({ page }) => {
  const requests = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let data = [];
    if (path === '/api/me') {
      data = { id: 4, role: 'employer' };
    }
    if (path === '/api/employer/applications') {
      data = Array.from({ length: 13 }, (_, index) => ({
        application_id: index + 1, vacancy_id: 1, vacancy_title: 'Разработчик',
        seeker_id: 5, resume_id: 9, resume_title: 'Frontend', first_name: 'Иван', last_name: 'Петров',
        status: 'created', applied_at: '2026-11-07T10:00:00Z', cover_letter: '<script>Привет</script>',
      }));
    }
    if (path === '/api/resumes/9') {
      data = { id: 9, seeker_id: 5, title: 'Frontend', description: 'Опыт разработки' };
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/applicants');
  await expect(page.getByRole('link', { name: 'Смотреть резюме' })).toHaveCount(12);
  await page.locator('[data-page="2"]').first().click();
  await expect(page.getByRole('link', { name: 'Смотреть резюме' })).toHaveCount(1);
  await page.getByText('Сопроводительное письмо').click();
  await expect(page.getByText('<script>Привет</script>', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Смотреть резюме' }).click();
  await expect(page).toHaveURL('/resumes/9');
  await expect(page.getByText('Опыт разработки')).toBeVisible();
  expect(requests).not.toContain('/api/employer/vacancies');
});
