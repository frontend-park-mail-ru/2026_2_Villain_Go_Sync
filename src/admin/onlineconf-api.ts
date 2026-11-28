import { ApiError, onlineConfRequest } from '../api';
import { parseKey, type OnlineConfFlag, type OnlineConfKey } from './keys';

interface Scope {
  id: number;
  name: string;
}

export interface OnlineConfCatalog {
  ownerUserId: number;
  scopes: Scope[];
  keys: OnlineConfKey[];
}

/** Основные поля флага сохранены, но требуется завершить изменение персональных настроек. */
export class FlagOverridesSaveError extends Error {
  /**
   * @param flag Сохранённые основные поля флага.
   * @param cause Ошибка персональных настроек.
   * @param pending ID, состояние которых нужно повторно сверить при сохранении.
   */
  constructor(readonly flag: OnlineConfFlag, cause: unknown, readonly pending: string[]) {
    super('Флаг сохранён, но персональные настройки применены не полностью.', { cause });
  }
}

/**
 * Проверяет формат объекта из JSON-ответа.
 * @param value Полученное значение.
 * @returns Поля объекта.
 * @throws {TypeError} Ответ не является объектом.
 */
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || !value || Array.isArray(value)) {
    throw new TypeError('Некорректный ответ OnlineConf');
  }
  return value as Record<string, unknown>;
}

/**
 * Проверяет числовой идентификатор ресурса.
 * @param value Значение из JSON-ответа.
 * @returns Идентификатор.
 * @throws {TypeError} Идентификатор нельзя использовать в запросе.
 */
function resourceId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('Некорректный идентификатор OnlineConf');
  }
  return value;
}

/**
 * Читает все страницы серверного списка.
 * @param path Путь ресурса в административном API.
 * @returns Элементы списка в порядке, полученном от сервера.
 * @throws {TypeError} Ответ или курсор некорректен.
 */
async function getPages(path: string): Promise<unknown[]> {
  const items: unknown[] = [];
  const seen = new Set<number>();
  let cursor: number | null = null;
  do {
    const query = cursor === null ? '?limit=100' : `?limit=100&cursor=${cursor}`;
    const page = record(await onlineConfRequest('GET', `${path}${query}`));
    if (!Array.isArray(page.items)) { throw new TypeError('Некорректная страница OnlineConf'); }
    items.push(...page.items);
    cursor = page.next_cursor === null ? null : resourceId(page.next_cursor);
    if (cursor !== null) {
      if (seen.has(cursor)) { throw new TypeError('Курсор OnlineConf повторился'); }
      seen.add(cursor);
    }
  } while (cursor !== null);
  return items;
}

/**
 * Преобразует DTO ключа API в данные каталога.
 * @param value Ключ из ответа сервера.
 * @returns Ключ для отображения и редактирования.
 */
function readKey(value: unknown): OnlineConfKey {
  const entry = record(value);
  const common = {
    id: resourceId(entry.id),
    ownerUserId: resourceId(entry.owner_user_id),
    name: entry.name,
    scope: entry.scope_name,
    description: entry.description ?? undefined,
  };
  if (entry.type === 'config' && Object.hasOwn(entry, 'value')) {
    return parseKey({ ...common, kind: 'config', value: entry.value });
  }
  if (entry.type === 'feature_flag' && Number.isInteger(entry.rollout_percentage)) {
    return parseKey({ ...common, kind: 'flag', enabled: entry.enabled, rollout: entry.rollout_percentage });
  }
  throw new TypeError('Некорректный тип или значение ключа OnlineConf');
}

/**
 * Проверяет сессию администратора и загружает доступные ключи и области.
 * @returns Каталог и ID текущего администратора.
 */
export async function getOnlineConfCatalog(): Promise<OnlineConfCatalog> {
  const actor = record(await onlineConfRequest('GET', '/me'));
  const ownerUserId = resourceId(actor.user_id);
  const [scopes, keys] = await Promise.all([getPages('/scopes'), getPages('/keys')]);
  return {
    ownerUserId,
    scopes: scopes.map((entry) => {
      const scope = record(entry);
      if (typeof scope.name !== 'string') { throw new TypeError('Некорректный scope OnlineConf'); }
      return { id: resourceId(scope.id), name: scope.name };
    }),
    keys: keys.map(readKey),
  };
}

/**
 * Сохраняет общие поля и значение конфига или состояние флага.
 * @param catalog Области и текущий администратор.
 * @param draft Данные из формы.
 * @param original Сохранённая версия при редактировании.
 * @returns Ключ, сохранённый на сервере.
 */
export async function saveOnlineConfKey(
  catalog: OnlineConfCatalog,
  draft: OnlineConfKey,
  original?: OnlineConfKey,
): Promise<OnlineConfKey> {
  const scope = catalog.scopes.find((entry) => entry.name === draft.scope);
  if (!scope) { throw new ApiError(422, 'unknown scope'); }
  const common = {
    scope_id: scope.id,
    owner_user_id: original?.ownerUserId ?? catalog.ownerUserId,
    name: draft.name,
    description: draft.description || null,
  };
  const endpoint = draft.kind === 'config' ? '/configs' : '/flags';
  const path = original ? `${endpoint}/${resourceId(original.id)}` : endpoint;
  const body = draft.kind === 'config'
    ? { ...common, value: draft.value }
    : { ...common, enabled: draft.enabled, rollout_percentage: draft.rollout };
  return readKey(await onlineConfRequest(original ? 'PUT' : 'POST', path, body));
}

/**
 * Загружает персональные настройки сохранённого флага.
 * @param flag Данные флага из каталога.
 * @returns Флаг с актуальными списками пользователей.
 */
export async function getOnlineConfOverrides(flag: OnlineConfFlag): Promise<OnlineConfFlag> {
  const items = await getPages(`/flags/${resourceId(flag.id)}/overrides`);
  const included: number[] = [];
  const excluded: number[] = [];
  for (const item of items) {
    const override = record(item);
    if (typeof override.enabled !== 'boolean') { throw new TypeError('Некорректное исключение OnlineConf'); }
    (override.enabled ? included : excluded).push(resourceId(override.user_id));
  }
  return { ...flag, included_users: included, excluded_users: excluded };
}

/**
 * Преобразует списки в карту настроек по ID.
 * @param flag Флаг с персональными настройками.
 * @returns Карта ID и соответствующих значений.
 */
function overrideMap(flag: OnlineConfFlag): Map<string, boolean> {
  return new Map([
    ...(flag.included_users ?? []).map((id) => [String(id), true] as const),
    ...(flag.excluded_users ?? []).map((id) => [String(id), false] as const),
  ]);
}

/**
 * Учитывает изменения формы и повторно сверяет их с состоянием сервера перед записью.
 * @param saved Флаг, уже сохранённый на сервере.
 * @param draft Флаг из формы с нужными ID.
 * @param original Списки при открытии редактора.
 * @param pending Изменения, оставшиеся от предыдущей попытки.
 * @returns Флаг с итоговыми персональными настройками.
 */
export async function saveOnlineConfOverrides(
  saved: OnlineConfFlag, draft: OnlineConfFlag, original?: OnlineConfFlag, pending: string[] = [],
): Promise<OnlineConfFlag> {
  const before = original ? overrideMap(original) : new Map<string, boolean>();
  const desired = overrideMap(draft);
  const changed = new Set(pending);
  for (const id of [...before.keys(), ...desired.keys()]) {
    if (before.get(id) !== desired.get(id)) { changed.add(id); }
  }
  if (changed.size === 0) {
    return { ...saved, included_users: draft.included_users, excluded_users: draft.excluded_users };
  }
  try {
    const actual = overrideMap(await getOnlineConfOverrides(saved));
    const endpoint = `/flags/${resourceId(saved.id)}/overrides`;
    for (const id of changed) {
      const enabled = desired.get(id);
      if (actual.get(id) === enabled) { continue; }
      if (enabled === undefined) {
        try {
          await onlineConfRequest('DELETE', `${endpoint}/${id}`);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) { throw error; }
        }
        actual.delete(id);
      } else {
        await onlineConfRequest('PUT', `${endpoint}/${id}`, { enabled });
        actual.set(id, enabled);
      }
    }
    return {
      ...saved,
      included_users: [...actual].filter(([, enabled]) => enabled).map(([id]) => id),
      excluded_users: [...actual].filter(([, enabled]) => !enabled).map(([id]) => id),
    };
  } catch (error) {
    throw new FlagOverridesSaveError(saved, error, [...changed]);
  }
}
