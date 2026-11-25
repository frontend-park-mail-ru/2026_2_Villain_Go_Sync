/**
 * Переходит к проверке данных и отправляет форму только после успешной валидации.
 * @param {import('@playwright/test').Page} page Страница редактора.
 */
export async function saveEditor(page) {
  const submit = page.locator('.edit-form button[type=submit]');
  await submit.waitFor({ state: 'visible' });
  const last = page.locator('.editor__steps [data-step]').last();
  if (await last.count()) {
    await last.click();
    if (await last.getAttribute('aria-current') !== 'step') { return; }
  }
  await submit.click();
}
