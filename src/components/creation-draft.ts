import { getCurrentUser, onSessionChange } from '../session';

const PREFIX = 'hirenoon:creation:';

/**
 * Привязывает черновик к пользователю и странице создания.
 * @param path Страница формы.
 * @returns Ключ хранилища текущей вкладки.
 */
function key(path: string): string {
  return `${PREFIX}${getCurrentUser()?.id}:${path}`;
}

/**
 * Сохраняет текстовые поля перед переходом к заполнению профиля.
 * @param path Страница создания.
 * @param form Форма документа.
 * @returns Удалось ли сохранить черновик.
 */
export function saveCreationDraft(path: string, form: HTMLFormElement): boolean {
  try {
    const fields = [...new FormData(form)].filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    sessionStorage.setItem(key(path), JSON.stringify(Object.fromEntries(fields)));
    return true;
  } catch { return false; }
}

/**
 * Восстанавливает только поля, существующие в форме.
 * @param path Страница создания.
 * @param form Форма документа.
 */
export function restoreCreationDraft(path: string, form: HTMLFormElement): void {
  try {
    const fields: unknown = JSON.parse(sessionStorage.getItem(key(path)) || 'null');
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) { return; }
    for (const [name, value] of Object.entries(fields)) {
      const field = form.elements.namedItem(name);
      if (typeof value === 'string' && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
        if (field instanceof HTMLInputElement && field.type === 'file') { continue; }
        field.value = value;
      }
    }
  } catch { /* Недоступное хранилище не мешает заполнить новую форму. */ }
}

/**
 * Удаляет черновик после сохранения или явной отмены.
 * @param path Страница создания.
 */
export function clearCreationDraft(path: string): void {
  try { sessionStorage.removeItem(key(path)); } catch { /* Хранилище может быть отключено. */ }
}

onSessionChange(() => {
  if (getCurrentUser() !== null) { return; }
  try {
    for (const item of Object.keys(sessionStorage)) {
      if (item.startsWith(PREFIX)) { sessionStorage.removeItem(item); }
    }
  } catch { /* Выход не зависит от доступа к хранилищу. */ }
});
