import { getCurrentUser, onSessionChange } from '../session';

const PREFIX = 'hirenoon:creation:';

export interface CreationDraft {
  draftPath: string;
  title: string;
  description: string;
  updated_at?: string;
}

/**
 * Привязывает черновик к пользователю и странице создания.
 * @param path Страница формы.
 * @returns Ключ хранилища текущей вкладки.
 */
function key(path: string): string {
  return `${PREFIX}${getCurrentUser()?.id}:${path}`;
}

/**
 * Читает черновик с датой сохранения или в прежнем формате без даты.
 * @param path Страница формы.
 * @returns Сохранённые поля и дата изменения, если она известна.
 */
function readDraft(path: string): { fields: Record<string, unknown>; updatedAt?: string } | null {
  try {
    const stored: Record<string, unknown> | null = JSON.parse(sessionStorage.getItem(key(path)) || 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) { return null; }
    if (stored.fields && typeof stored.fields === 'object' && !Array.isArray(stored.fields)) {
      return {
        fields: stored.fields as Record<string, unknown>,
        updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : undefined,
      };
    }
    return { fields: stored };
  } catch { return null; }
}

/**
 * @param path Страница формы.
 * @returns Есть ли сохранённый черновик для этой формы.
 */
export function hasCreationDraft(path: string): boolean {
  return readDraft(path) !== null;
}

/**
 * Возвращает сохранённые в текущей вкладке черновики вакансии или резюме.
 * @param path Страница создания документа.
 * @param untitled Подпись черновика без названия.
 * @returns Черновики текущего пользователя для списка.
 */
export function getCreationDrafts(path: '/vacancies/new' | '/resumes/new', untitled: string): CreationDraft[] {
  const user = getCurrentUser();
  if (!user || user.id === null) { return []; }
  const prefix = key('');
  try {
    const drafts: CreationDraft[] = [];
    for (const item of Object.keys(sessionStorage)) {
      if (!item.startsWith(prefix)) { continue; }
      const draftPath = item.slice(prefix.length);
      const isResumeCopy = path === '/resumes/new' && /^\/resumes\/new\?copy=[1-9]\d*$/.test(draftPath);
      if (draftPath !== path && !isResumeCopy) { continue; }
      const draft = readDraft(draftPath);
      if (!draft) { continue; }
      const { title, description } = draft.fields;
      drafts.push({
        draftPath,
        title: (typeof title === 'string' && title.trim()) || untitled,
        description: typeof description === 'string' ? description.trim() : '',
        updated_at: draft.updatedAt,
      });
    }
    return drafts;
  } catch { return []; }
}

/**
 * Сохраняет текстовые поля и дату изменения черновика.
 * @param path Страница создания.
 * @param form Форма документа.
 * @returns Удалось ли сохранить черновик.
 */
export function saveCreationDraft(path: string, form: HTMLFormElement): boolean {
  try {
    const fields = [...new FormData(form)].filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    sessionStorage.setItem(key(path), JSON.stringify({ fields: Object.fromEntries(fields), updatedAt: new Date().toISOString() }));
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
    const draft = readDraft(path);
    if (!draft) { return; }
    for (const [name, value] of Object.entries(draft.fields)) {
      const field = form.elements.namedItem(name);
      if (typeof value === 'string' && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
        if (field instanceof HTMLInputElement && field.type === 'file') { continue; }
        field.value = value;
        if (field.dataset.extra) { field.dispatchEvent(new Event('change')); }
      }
    }
  } catch { /* Недоступное хранилище не мешает заполнить новую форму. */ }
}

/**
 * Удаляет черновик после публикации или по команде пользователя.
 * @param path Страница создания.
 * @returns Удалось ли удалить черновик.
 */
export function clearCreationDraft(path: string): boolean {
  try {
    sessionStorage.removeItem(key(path));
    return true;
  } catch { return false; }
}

onSessionChange(() => {
  if (getCurrentUser() !== null) { return; }
  try {
    for (const item of Object.keys(sessionStorage)) {
      if (item.startsWith(PREFIX)) { sessionStorage.removeItem(item); }
    }
  } catch { /* Выход не зависит от доступа к хранилищу. */ }
});
