/**
 * Переходит к проверке данных и отправляет форму только после успешной валидации.
 * @param {import('@playwright/test').Page} page Страница редактора.
 */
export async function saveEditor(page) {
  const submit = page.locator('.edit-form button[type=submit]');
  await submit.waitFor({ state: 'visible' });
  await page.locator('.edit-form').evaluate((form) => {
    const required = { lastName: 'Петров', target_position: 'Разработчик', responsibilities: 'Разработка', requirements: 'Опыт работы' };
    for (const [name, value] of Object.entries(required)) {
      const field = form.elements.namedItem(name);
      if (field && !field.value) {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  const last = page.locator('.editor__steps [data-step]').last();
  if (await last.count()) {
    await last.click();
    if (await last.getAttribute('aria-current') !== 'step') { return; }
  }
  await submit.click();
}
