import { test, expect } from '@playwright/test';

for (const role of ['seeker', 'employer']) {
  for (const status of [404, 500]) {
    test(`заглушка ${role}: профиль отвечает ${status}`, async ({ page }, testInfo) => {
      const collection = role === 'seeker' ? 'seekers' : 'employers';
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/me') {
          return route.fulfill({ json: { data: { id: 5, role } } });
        }
        if (path === `/api/${collection}/5`) {
          return route.fulfill({ status, json: { error: 'profile unavailable' } });
        }
        return route.fulfill({ json: { data: [] } });
      });
      await page.goto('/profile');

      const avatar = page.getByRole('button', { name: 'Меню профиля' });
      const radius = role === 'seeker' ? '50%' : '12px';
      const icon = role === 'seeker' ? 'avatar-person.svg' : 'avatar-company.svg';
      await expect(avatar).toHaveCSS('width', '48px');
      await expect(avatar).toHaveCSS('height', '48px');
      await expect(avatar).toHaveCSS('border-radius', radius);
      await expect(avatar).toHaveCSS('background-color', 'rgb(249, 234, 226)');
      await expect(avatar).toHaveText('');
      await expect(avatar.locator('span')).toBeVisible();
      await expect(avatar.locator('span')).toHaveCSS('width', '24px');
      await expect(avatar.locator('span')).toHaveCSS('height', '24px');
      await expect(avatar.locator('span')).toHaveCSS('mask-image', new RegExp(icon.replace('.', '\\.')));
      await expect(avatar.locator('span')).toHaveCSS('color', 'rgb(106, 96, 99)');
      await expect(avatar.locator('img')).toHaveCount(0);

      if (status === 404) {
        const profileAvatar = page.locator('.profile__avatar');
        await expect(page.getByRole('link', { name: 'Заполнить профиль' })).toBeVisible();
        await expect(profileAvatar).toHaveCSS('width', '80px');
        await expect(profileAvatar).toHaveCSS('height', '80px');
        await expect(profileAvatar).toHaveCSS('border-radius', radius);
        await expect(profileAvatar.locator('span')).toHaveCSS('mask-image', new RegExp(icon.replace('.', '\\.')));
        await page.screenshot({ path: testInfo.outputPath(`${role}-desktop.png`), fullPage: true });
        await page.setViewportSize({ width: 320, height: 900 });
        await expect(profileAvatar).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      } else {
        await expect(page.getByRole('heading', { name: 'Не удалось загрузить профиль' })).toBeVisible();
      }

      await avatar.click();
      await expect(page.getByRole('link', { name: 'Профиль', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(avatar).toHaveAttribute('aria-expanded', 'false');
    });
  }
}
