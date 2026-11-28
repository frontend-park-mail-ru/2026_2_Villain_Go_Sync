import { ApiError } from '../api';
import renderHistoryRows from './history-rows.hbs';
import { getOnlineConfHistory } from './onlineconf-api';

const dialog = document.querySelector<HTMLDialogElement>('#history-dialog')!;
const list = document.querySelector<HTMLElement>('#history-list')!;
const status = document.querySelector<HTMLElement>('#history-status')!;
const more = document.querySelector<HTMLButtonElement>('#history-more')!;
const open = document.querySelector<HTMLButtonElement>('#open-history')!;

const resourceTypes: ReadonlyMap<string, string> = new Map([
  ['config', 'Конфиг'],
  ['feature_flag', 'Флаг'],
  ['feature_flag_override', 'Персональное исключение'],
  ['scope', 'Область'],
  ['admin', 'Администратор'],
]);
const actions: ReadonlyMap<string, string> = new Map([
  ['create', 'Создание'],
  ['update', 'Изменение'],
  ['delete', 'Удаление'],
]);
const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });

let cursor: number | null = null;
let version = 0;

/**
 * Отображает JSON-снимок, сохраняя различие между отсутствием и значением null.
 * @param value Снимок из истории.
 * @returns Текст для показа в записи.
 */
function formatSnapshot(value: unknown): string {
  return value === undefined ? '—' : JSON.stringify(value, null, 2);
}

/** Добавляет следующую страницу в открытую историю. */
async function loadHistory(): Promise<void> {
  const current = version;
  const buttonFocused = document.activeElement === more;
  status.textContent = 'Загружаем историю…';
  more.disabled = true;

  try {
    const page = await getOnlineConfHistory(cursor);
    if (!dialog.open || version !== current) { return; }
    const entryCount = list.childElementCount;
    const entries = page.entries.map((entry) => ({
      ...entry,
      resourceType: resourceTypes.get(entry.resourceType) ?? entry.resourceType,
      actionLabel: actions.get(entry.action) ?? 'Операция',
      dateLabel: dateTime.format(new Date(entry.createdAt)),
      before: formatSnapshot(entry.before),
      after: formatSnapshot(entry.after),
    }));
    list.insertAdjacentHTML('beforeend', renderHistoryRows({ entries }));
    cursor = page.nextCursor;
    status.textContent = list.childElementCount === 0 ? 'История пока пуста.' : `Показано записей — ${list.childElementCount}.`;
    more.textContent = 'Загрузить ещё';
    more.hidden = cursor === null;
    if (buttonFocused && more.hidden) {
      list.children[entryCount]?.querySelector<HTMLElement>('summary')?.focus();
    }
  } catch (error) {
    if (!dialog.open || version !== current) { return; }
    const code = error instanceof ApiError ? error.status : undefined;
    status.textContent = code === 401 ? 'Сессия истекла. Войдите в HireNoon.'
      : code === 403 ? 'У вас нет доступа к истории изменений.'
        : 'Не удалось загрузить историю изменений.';
    more.textContent = 'Повторить';
    more.hidden = code === 401 || code === 403;
  } finally {
    if (version === current) { more.disabled = false; }
  }
}

/** Показывает вход в историю после загрузки реального каталога. */
export function enableHistory(): void {
  open.hidden = false;
}

open.addEventListener('click', () => {
  version += 1;
  cursor = null;
  list.replaceChildren();
  more.hidden = true;
  dialog.showModal();
  void loadHistory();
});
more.addEventListener('click', () => { void loadHistory(); });
