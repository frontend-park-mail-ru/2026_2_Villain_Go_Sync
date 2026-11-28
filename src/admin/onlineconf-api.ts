import { ApiError, onlineConfRequest } from '../api';
import { parseKey, type OnlineConfFlag, type OnlineConfKey } from './keys';

export interface OnlineConfScope {
  id: number;
  name: string;
  description: string | null;
}

export type OnlineConfRole = 'owner' | 'admin';

export interface OnlineConfAdmin {
  userId: number;
  role: OnlineConfRole;
}

export interface OnlineConfCatalog {
  ownerUserId: number;
  role: OnlineConfRole;
  scopes: OnlineConfScope[];
  keys: OnlineConfKey[];
}

export interface HistoryEntry {
  actorUserId: number;
  resourceType: string;
  resourceName: string;
  action: string;
  createdAt: string;
  before?: unknown;
  after?: unknown;
}

export interface FlagEvaluation {
  enabled: boolean;
  reason: string;
  rollout: number;
  bucket?: number;
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
 * Проверяет оболочку курсорной страницы.
 * @param value Тело ответа OnlineConf.
 * @returns Элементы страницы и следующий курсор.
 * @throws {TypeError} Страница не соответствует контракту.
 */
function readPage(value: unknown): { items: unknown[]; nextCursor: number | null } {
  const page = record(value);
  if (!Array.isArray(page.items)) { throw new TypeError('Некорректная страница OnlineConf'); }
  return { items: page.items, nextCursor: page.next_cursor === null ? null : resourceId(page.next_cursor) };
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
    const page = readPage(await onlineConfRequest('GET', `${path}${query}`));
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seen.has(cursor)) { throw new TypeError('Курсор OnlineConf повторился'); }
      seen.add(cursor);
    }
  } while (cursor !== null);
  return items;
}

/**
 * Загружает одну страницу истории изменений от новых записей к старым.
 * @param cursor Курсор для следующей страницы.
 * @returns События аудита и курсор для подгрузки.
 * @throws {TypeError} Запись истории не соответствует контракту.
 */
export async function getOnlineConfHistory(cursor: number | null): Promise<{ entries: HistoryEntry[]; nextCursor: number | null }> {
  const query = new URLSearchParams({ limit: '15' });
  if (cursor !== null) { query.set('cursor', String(cursor)); }
  const page = readPage(await onlineConfRequest('GET', `/history?${query}`));
  const entries = page.items.map((item): HistoryEntry => {
    const entry = record(item);
    if (typeof entry.resource_type !== 'string' || typeof entry.resource_name !== 'string'
      || (entry.scope_name !== null && typeof entry.scope_name !== 'string')
      || typeof entry.action !== 'string' || typeof entry.created_at !== 'string'
      || !Number.isFinite(Date.parse(entry.created_at))) {
      throw new TypeError('Некорректная запись истории OnlineConf');
    }
    return {
      actorUserId: resourceId(entry.actor_user_id),
      resourceType: entry.resource_type,
      resourceName: entry.scope_name ? `${entry.scope_name}.${entry.resource_name}` : entry.resource_name,
      action: entry.action,
      createdAt: entry.created_at,
      before: entry.old_value,
      after: entry.new_value,
    };
  });
  return { entries, nextCursor: page.nextCursor };
}

/**
 * Проверяет состояние флага для заданного пользователя на сервере.
 * @param flagId Идентификатор флага.
 * @param userId Идентификатор пользователя из формы.
 * @returns Результирующее состояние и причина.
 * @throws {TypeError} Формат результата неизвестен.
 */
export async function evaluateOnlineConfFlag(flagId: number, userId: string): Promise<FlagEvaluation> {
  const query = new URLSearchParams({ user_id: userId });
  const result = record(await onlineConfRequest('GET', `/flags/${resourceId(flagId)}/evaluate?${query}`));
  const { enabled, reason, rollout_percentage: rollout, bucket } = result;
  if (typeof enabled !== 'boolean' || typeof reason !== 'string'
    || typeof rollout !== 'number' || !Number.isInteger(rollout) || rollout < 0 || rollout > 100
    || (bucket !== undefined && (typeof bucket !== 'number' || !Number.isInteger(bucket) || bucket < 0 || bucket > 99))) {
    throw new TypeError('Некорректный результат проверки флага');
  }
  return { enabled, reason, rollout, bucket };
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
    scopeId: resourceId(entry.scope_id),
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
 * Читает область из ответа API.
 * @param value Ответ сервиса.
 * @returns Область для каталога и редактора.
 * @throws {TypeError} Неверный формат области.
 */
function readScope(value: unknown): OnlineConfScope {
  const scope = record(value);
  if (typeof scope.name !== 'string' || (scope.description !== null && typeof scope.description !== 'string')) {
    throw new TypeError('Некорректный scope OnlineConf');
  }
  return { id: resourceId(scope.id), name: scope.name, description: scope.description };
}

/**
 * Читает роль и ID администратора.
 * @param value Ответ сервиса.
 * @returns Администратор OnlineConf.
 * @throws {TypeError} Роль отсутствует в контракте.
 */
function readAdmin(value: unknown): OnlineConfAdmin {
  const admin = record(value);
  if (admin.role !== 'owner' && admin.role !== 'admin') { throw new TypeError('Некорректная роль OnlineConf'); }
  return { userId: resourceId(admin.user_id), role: admin.role };
}

/**
 * Проверяет сессию администратора и загружает доступные ключи и области.
 * @returns Каталог и ID текущего администратора.
 */
export async function getOnlineConfCatalog(): Promise<OnlineConfCatalog> {
  const actor = readAdmin(await onlineConfRequest('GET', '/me'));
  const [scopes, keys] = await Promise.all([getOnlineConfScopes(), getPages('/keys')]);
  return {
    ownerUserId: actor.userId,
    role: actor.role,
    scopes,
    keys: keys.map(readKey),
  };
}

/**
 * Загружает области из OnlineConf.
 * @returns Все области каталога.
 */
export async function getOnlineConfScopes(): Promise<OnlineConfScope[]> {
  return (await getPages('/scopes')).map(readScope);
}

/**
 * Сохраняет область через административный API.
 * @param scope Название и описание области.
 * @param id ID области при редактировании.
 * @returns Сохранённая область.
 */
export async function saveOnlineConfScope(scope: Omit<OnlineConfScope, 'id'>, id?: number): Promise<OnlineConfScope> {
  return readScope(await onlineConfRequest(id === undefined ? 'POST' : 'PUT', id === undefined ? '/scopes' : `/scopes/${id}`, scope));
}

/**
 * Удаляет область через API.
 * @param id ID области.
 */
export async function deleteOnlineConfScope(id: number): Promise<void> {
  await onlineConfRequest('DELETE', `/scopes/${id}`);
}

/**
 * Загружает администраторов от имени владельца.
 * @returns Записи об учётных записях с доступом.
 */
export async function getOnlineConfAdmins(): Promise<OnlineConfAdmin[]> {
  return (await getPages('/admins')).map(readAdmin);
}

/**
 * Выдаёт доступ или меняет роль в OnlineConf.
 * @param userId Идентификатор пользователя HireNoon.
 * @param role Новая роль.
 * @param edit Меняется ли роль существующего администратора.
 * @returns Сохранённая роль пользователя.
 */
export async function saveOnlineConfAdmin(userId: number, role: OnlineConfRole, edit: boolean): Promise<OnlineConfAdmin> {
  return readAdmin(await onlineConfRequest(
    edit ? 'PUT' : 'POST', edit ? `/admins/${userId}` : '/admins', edit ? { role } : { user_id: userId, role },
  ));
}

/**
 * Отзывает административный доступ.
 * @param userId Идентификатор пользователя.
 */
export async function deleteOnlineConfAdmin(userId: number): Promise<void> {
  await onlineConfRequest('DELETE', `/admins/${userId}`);
}

/**
 * Удаляет ключ его собственного типа.
 * @param key Конфиг или флаг из каталога.
 */
export async function deleteOnlineConfKey(key: OnlineConfKey): Promise<void> {
  const endpoint = key.kind === 'config' ? 'configs' : 'flags';
  await onlineConfRequest('DELETE', `/${endpoint}/${resourceId(key.id)}`);
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
