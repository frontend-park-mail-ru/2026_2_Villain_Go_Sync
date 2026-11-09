import { test, expect } from '@playwright/test';

for (const role of ['seeker', 'employer']) {
  for (const kind of ['zero', 'empty-name', 'wrong-owner', 'missing-id', 'string-id', 'null', 'valid']) {
    test(`профиль ${role}: ответ 200, ${kind}`, async ({ page }) => {
      const name = role === 'seeker' ? 'first_name' : 'company_name';
      const collection = role === 'seeker' ? 'seekers' : 'employers';
      const profile = kind === 'null' ? null : {
        user_id: kind === 'zero' ? 0 : kind === 'wrong-owner' ? 6 : kind === 'missing-id' ? undefined : kind === 'string-id' ? '5' : 5,
        first_name: 'Иван', last_name: 'Петров', company_name: 'Компания', phone: '', website: '', description: '',
        [name]: kind === 'zero' || kind === 'empty-name' ? ' \u200B ' : 'Тест',
      };
      const writes = [];
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (!['GET', 'OPTIONS'].includes(request.method())) { writes.push(path); }
        if (path === '/api/me') { return route.fulfill({ json: { data: { id: 5, role } } }); }
        if (path === `/api/${collection}/5`) { return route.fulfill({ json: { data: profile } }); }
        return route.fulfill({ json: { data: [] } });
      });

      await page.goto(role === 'seeker' ? '/resumes/new' : '/vacancies/new');
      if (kind === 'valid') {
        await expect(page.locator('[name=title]')).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Сначала заполните профиль' })).toBeVisible();
        await expect(page.locator('[name=title]')).toHaveCount(0);
        await expect(page.locator('.header__avatar')).toHaveText('');
      }

      await page.goto('/profile');
      if (kind === 'valid') {
        await expect(page.getByRole('link', { name: 'Редактировать профиль' })).toBeVisible();
      } else {
        await expect(page.getByRole('link', { name: 'Заполнить профиль' })).toBeVisible();
        await expect(page.locator('.profile__avatar')).toHaveText('');
      }

      await page.goto('/profile/edit');
      const existing = kind === 'valid' || kind === 'empty-name';
      await expect(page.locator(role === 'seeker' ? '[name=firstName]' : '[name=companyName]')).toHaveValue(existing ? profile[name] : '');
      await expect(page.locator('#profile-image-message')).toContainText(existing ? 'Изображение сохраняется сразу.' : 'Изображение сохранится вместе с профилем.');
      if (kind === 'empty-name' && role === 'seeker') {
        await expect(page.locator('[name=lastName]')).toHaveValue('Петров');
      }
      expect(writes).toEqual([]);
    });
  }
}
