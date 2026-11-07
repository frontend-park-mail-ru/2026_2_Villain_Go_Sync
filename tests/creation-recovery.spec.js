import { test, expect } from '@playwright/test';

for (const role of ['seeker', 'employer']) {
  test(`исчезнувший профиль: восстановление черновика и создание ${role}`, async ({ page }) => {
    const resource = role === 'seeker' ? 'resumes' : 'vacancies';
    const destination = `/${resource}/new`;
    let profileExists = true;
    let posts = 0;
    let saved;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/me') { return route.fulfill({ json: { data: { id: 5, role } } }); }
      if (path === `/api/${resource}` && request.method() === 'POST') {
        posts++;
        if (posts === 1) {
          profileExists = false;
          return route.fulfill({ status: role === 'seeker' ? 404 : 403, json: { error: 'failed to create' } });
        }
        saved = { ...request.postDataJSON(), id: 9, seeker_id: 5, employer_id: 5, company_name: 'Компания' };
        return route.fulfill({ status: 201, json: { data: saved } });
      }
      if (path === `/api/${resource}/9`) { return route.fulfill({ json: { data: saved } }); }
      if (path.startsWith('/api/profile/')) {
        profileExists = true;
        return route.fulfill({ json: { data: null } });
      }
      if (path === '/api/seekers/5' || path === '/api/employers/5') {
        return route.fulfill({ status: profileExists ? 200 : 404, json: { data: profileExists ? { first_name: 'Иван', last_name: 'Петров', company_name: 'Компания', phone: '', website: '', description: '' } : null } });
      }
      return route.fulfill({ status: 404, json: { error: 'not found' } });
    });
    await page.goto(destination);
    await page.locator('[name="title"]').fill('Название черновика');
    await page.locator('[name="description"]').fill('Первый абзац\nВторой <без HTML>');
    if (role === 'employer') {
      await page.locator('[name="salaryFrom"]').fill('100000');
      await page.locator('[name="currency"]').selectOption('EUR');
    } else {
      await page.locator('[name="experience"]').fill('Опыт работы');
    }
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: 'Сначала заполните профиль' })).toBeVisible();
    await expect(page.locator('[name="title"]')).toHaveValue('Название черновика');
    await page.getByRole('button', { name: 'Заполнить профиль' }).click();
    await page.reload();
    await page.locator(role === 'seeker' ? '[name="firstName"]' : '[name="companyName"]').fill('Тест');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(destination);
    await expect(page.locator('[name="title"]')).toHaveValue('Название черновика');
    await expect(page.locator('[name="description"]')).toHaveValue('Первый абзац\nВторой <без HTML>');
    if (role === 'employer') { await expect(page.locator('[name="currency"]')).toHaveValue('EUR'); }
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`/${resource}/9`);
    expect(posts).toBe(2);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('hirenoon:creation:')))).toEqual([]);
  });
}

test('внешний next не перенаправляет после сохранения профиля', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { data: route.request().url().endsWith('/me')
    ? { id: 5, role: 'seeker' } : { first_name: 'Иван', last_name: '', phone: '', description: '' } } }));
  await page.goto('/profile/edit?next=//example.com');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('/profile');
});
