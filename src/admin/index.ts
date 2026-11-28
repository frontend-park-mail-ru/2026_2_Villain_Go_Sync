import './styles.scss';

import { ApiError } from '../api';
import { bindKeyEditor } from './key-editor';
import renderKeyRows from './key-rows.hbs';
import { sameKey, type OnlineConfFlag, type OnlineConfKey } from './keys';
import {
  getOnlineConfCatalog, getOnlineConfOverrides, saveOnlineConfKey, saveOnlineConfOverrides,
  type OnlineConfCatalog,
} from './onlineconf-api';

type KindFilter = 'all' | OnlineConfKey['kind'];

const catalog = document.querySelector<HTMLElement>('#catalog')!;
const search = document.querySelector<HTMLInputElement>('#key-search')!;
const scope = document.querySelector<HTMLSelectElement>('#key-scope')!;
const table = document.querySelector<HTMLTableElement>('#key-table')!;
const rows = document.querySelector<HTMLTableSectionElement>('#key-rows')!;
const empty = document.querySelector<HTMLElement>('#empty-state')!;
const emptyTitle = document.querySelector<HTMLElement>('#empty-title')!;
const reset = document.querySelector<HTMLButtonElement>('#reset-filters')!;
const results = document.querySelector<HTMLElement>('#results')!;
const saveFeedback = document.querySelector<HTMLElement>('#save-feedback')!;
const kindButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-kind]'));
const loadState = document.querySelector<HTMLElement>('#load-state')!;
const loadMessage = document.querySelector<HTMLElement>('#load-message')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const signIn = document.querySelector<HTMLAnchorElement>('#login-link')!;
const dialog = document.querySelector<HTMLDialogElement>('#key-dialog')!;
const createButton = document.querySelector<HTMLButtonElement>('#create-key')!;
const editButton = document.querySelector<HTMLButtonElement>('#edit-key')!;
const overrideStatus = document.querySelector<HTMLElement>('#override-status')!;
const overridePanel = document.querySelector<HTMLElement>('#dialog-overrides')!;

let keys: OnlineConfKey[] = [];
let visibleKeys: OnlineConfKey[] = [];
let kind: KindFilter = 'all';
let selectedKey: OnlineConfKey | undefined;
let liveCatalog: OnlineConfCatalog | undefined;
let detailRequest = 0;

const openEditor = bindKeyEditor(persistKey, showSavedKey);

/**
 * Возвращает области, задействованные в каталоге.
 * @returns Уникальные названия областей.
 */
function scopes(): string[] {
  const names = liveCatalog ? liveCatalog.scopes.map((entry) => entry.name) : keys.map((key) => key.scope);
  return [...new Set(names)].sort();
}

/** Обновляет список областей и счётчики после изменения каталога. */
function refreshFilters(): void {
  const selectedScope = scope.value;
  const names = scopes();
  scope.replaceChildren(new Option('Все области', ''), ...names.map((name) => new Option(name, name)));
  if (names.includes(selectedScope)) { scope.value = selectedScope; }

  const configCount = keys.filter((key) => key.kind === 'config').length;
  document.querySelector('[data-count="all"]')!.textContent = String(keys.length);
  document.querySelector('[data-count="config"]')!.textContent = String(configCount);
  document.querySelector('[data-count="flag"]')!.textContent = String(keys.length - configCount);
}

/** Обновляет список по названию, области и типу. */
function renderCatalog(): void {
  const query = search.value.trim().toLowerCase();
  visibleKeys = keys.filter((key) => (kind === 'all' || key.kind === kind)
    && (!scope.value || key.scope === scope.value)
    && `${key.scope}.${key.name}`.toLowerCase().includes(query));

  for (const button of kindButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  }

  rows.innerHTML = renderKeyRows({
    rows: visibleKeys.map((key, rowIndex) => ({
      ...key,
      rowIndex,
      isFlag: key.kind === 'flag',
      preview: key.kind === 'config' ? JSON.stringify(key.value) : '',
    })),
  });
  table.hidden = visibleKeys.length === 0;
  empty.hidden = visibleKeys.length > 0;
  emptyTitle.textContent = keys.length > 0 ? 'Ключи не найдены' : 'В каталоге пока нет ключей';
  reset.hidden = keys.length === 0;
  results.textContent = `Показано ${visibleKeys.length} из ${keys.length}`;
}

/**
 * Показывает списки включения и исключения в карточке флага.
 * @param flag Флаг с загруженными настройками.
 */
function renderOverrides(flag: OnlineConfFlag): void {
  dialog.querySelector('#dialog-included')!.textContent = flag.included_users?.join(', ') || '—';
  dialog.querySelector('#dialog-excluded')!.textContent = flag.excluded_users?.join(', ') || '—';
  overridePanel.hidden = false;
}

/**
 * Получает персональные настройки флага и показывает результат в актуальной карточке.
 * @param flag Флаг из каталога.
 * @param version Номер открытия карточки.
 */
async function loadOverrides(flag: OnlineConfFlag, version: number): Promise<void> {
  overrideStatus.textContent = 'Загружаем персональные настройки…';
  overrideStatus.hidden = false;
  editButton.disabled = true;
  try {
    const updated = await getOnlineConfOverrides(flag);
    if (!dialog.open || version !== detailRequest) { return; }
    selectedKey = updated;
    renderOverrides(updated);
    overrideStatus.hidden = true;
    editButton.disabled = false;
  } catch {
    if (!dialog.open || version !== detailRequest) { return; }
    overrideStatus.textContent = 'Персональные настройки не загрузились. Откройте карточку повторно.';
  }
}

/**
 * Показывает полное значение ключа, а для флага — настройки раскатки.
 * @param key Ключ, открытый пользователем.
 */
function openKey(key: OnlineConfKey): void {
  const version = ++detailRequest;
  selectedKey = key;
  dialog.querySelector('#dialog-title')!.textContent = `${key.scope}.${key.name}`;
  const description = dialog.querySelector<HTMLElement>('#dialog-description')!;
  description.textContent = key.description ?? '';
  description.hidden = !key.description;

  const isFlag = key.kind === 'flag';
  dialog.querySelector('#dialog-type')!.textContent = isFlag ? 'Feature flag' : 'Конфиг';
  dialog.querySelector('#dialog-value-label')!.textContent = isFlag ? 'Раскатка' : 'Значение';
  dialog.querySelector('#dialog-value')!.textContent = isFlag
    ? `${key.enabled ? 'Включён' : 'Выключен'} · ${key.rollout}%`
    : JSON.stringify(key.value, null, 2);
  overridePanel.hidden = true;
  overrideStatus.hidden = true;
  editButton.disabled = false;
  dialog.showModal();
  if (isFlag) {
    if (liveCatalog) { void loadOverrides(key, version); } else { renderOverrides(key); }
  }
}

/**
 * Открывает форму с учётом текущих фильтров.
 * @param key Ключ для редактирования или `undefined` при создании.
 */
function editKey(key?: OnlineConfKey): void {
  saveFeedback.textContent = '';
  openEditor({ key, scope: scope.value, kind: kind === 'flag' ? 'flag' : 'config', scopes: scopes(), live: Boolean(liveCatalog) });
}

/**
 * Заменяет сохранённый ключ в памяти каталога.
 * @param key Ключ из ответа сервера.
 */
function updateKey(key: OnlineConfKey): void {
  const index = keys.findIndex((entry) => sameKey(entry, key));
  if (index < 0) { keys.push(key); } else { keys[index] = key; }
}

/**
 * Сохраняет ключ в демо-каталоге или через API.
 * @param key Данные из формы.
 * @param original Сохранённая версия при редактировании.
 * @param pending ID с незавершёнными изменениями.
 * @returns Сохранённый ключ.
 */
async function persistKey(key: OnlineConfKey, original?: OnlineConfKey, pending?: string[]): Promise<OnlineConfKey> {
  if (process.env.ONLINECONF_DEMO === 'true') {
    const { saveDemoKey } = await import('./demo-keys');
    keys = saveDemoKey(key, original !== undefined);
    return key;
  }

  if (!liveCatalog) { throw new Error('Каталог OnlineConf не загружен'); }
  let saved = await saveOnlineConfKey(liveCatalog, key, original);
  if (!sameKey(key, saved) || key.kind !== saved.kind) { throw new TypeError('API вернул другой ключ OnlineConf'); }

  if (saved.kind === 'flag' && key.kind === 'flag') {
    try {
      saved = await saveOnlineConfOverrides(saved, key, original?.kind === 'flag' ? original : undefined, pending);
    } catch (error) {
      updateKey(saved);
      refreshFilters();
      renderCatalog();
      throw error;
    }
  }
  updateKey(saved);
  return saved;
}

/**
 * Показывает результат сохранения и возвращает пользователю фокус.
 * @param key Ключ, который только что сохранили.
 */
function showSavedKey(key: OnlineConfKey): void {
  refreshFilters();
  renderCatalog();

  const index = visibleKeys.findIndex((entry) => sameKey(entry, key));
  saveFeedback.textContent = index < 0 ? 'Ключ сохранён. Он скрыт текущими фильтрами.' : 'Ключ сохранён.';
  const keyButton = rows.querySelector<HTMLButtonElement>(`[data-key-index="${index}"]`);
  if (keyButton) { keyButton.focus(); } else { createButton.focus({ preventScroll: true }); }
}

/** Загружает ключи и показывает состояние доступа к каталогу. */
async function loadCatalog(): Promise<void> {
  loadMessage.textContent = 'Загружаем ключи…';
  retry.hidden = true;
  signIn.hidden = true;

  try {
    if (process.env.ONLINECONF_DEMO === 'true') {
      keys = (await import('./demo-keys')).getDemoKeys();
      document.querySelector<HTMLElement>('#demo-label')!.hidden = false;
    } else {
      liveCatalog = await getOnlineConfCatalog();
      keys = liveCatalog.keys;
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 401) {
      loadMessage.textContent = 'Войдите, чтобы открыть OnlineConf';
      signIn.hidden = false;
    } else if (status === 403) {
      loadMessage.textContent = 'У вас нет доступа к OnlineConf';
    } else {
      loadMessage.textContent = 'Не удалось загрузить ключи OnlineConf';
      retry.hidden = false;
    }
    return;
  }

  refreshFilters();
  loadState.hidden = true;
  createButton.hidden = false;
  catalog.hidden = false;
  renderCatalog();
}

search.addEventListener('input', renderCatalog);
scope.addEventListener('change', renderCatalog);
for (const button of kindButtons) {
  button.addEventListener('click', () => {
    kind = button.dataset.kind as KindFilter;
    renderCatalog();
  });
}

rows.addEventListener('click', (event) => {
  if (!(event.target instanceof HTMLButtonElement)) { return; }
  const key = visibleKeys[Number(event.target.dataset.keyIndex)];
  if (key) { openKey(key); }
});

createButton.addEventListener('click', () => editKey());
editButton.addEventListener('click', () => {
  if (!selectedKey) { return; }
  dialog.close();
  editKey(selectedKey);
});

reset.addEventListener('click', () => {
  search.value = '';
  scope.value = '';
  kind = 'all';
  renderCatalog();
  search.focus();
});

retry.addEventListener('click', () => { void loadCatalog(); });
void loadCatalog();
