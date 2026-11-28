export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface KeyFields {
  id?: number;
  scopeId?: number;
  ownerUserId?: number;
  name: string;
  scope: string;
  description?: string;
}

export type OnlineConfKey = KeyFields & (
  | { kind: 'config'; value: JsonValue }
  | { kind: 'flag'; enabled: boolean; rollout: number; included_users?: (number | string)[]; excluded_users?: (number | string)[] }
);

export type OnlineConfFlag = Extract<OnlineConfKey, { kind: 'flag' }>;

/**
 * Проверяет идентификаторы в списках персональных исключений.
 * @param value Список из API или `undefined`, если список не передан.
 * @returns Можно ли показать список без преобразования идентификаторов.
 */
function isUserList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value)
    && value.every((id) => typeof id === 'string' || Number.isSafeInteger(id)));
}

/**
 * Проверяет поля ключа из JSON-ответа перед отрисовкой.
 * @param entry Элемент каталога.
 * @returns Поддерживает ли каталог формат ключа.
 */
function isOnlineConfKey(entry: unknown): entry is OnlineConfKey {
  if (typeof entry !== 'object' || entry === null) { return false; }
  const key = entry as Record<string, unknown>;
  if (typeof key.name !== 'string' || typeof key.scope !== 'string'
    || (key.description !== undefined && typeof key.description !== 'string')) {
    return false;
  }

  if (key.kind === 'config') { return Object.hasOwn(key, 'value'); }

  return key.kind === 'flag' && typeof key.enabled === 'boolean' && typeof key.rollout === 'number'
    && key.rollout >= 0 && key.rollout <= 100
    && isUserList(key.included_users) && isUserList(key.excluded_users);
}

/**
 * Проверяет формат сохранённого ключа.
 * @param data Поле data ответа.
 * @returns Ключ в формате каталога.
 * @throws {TypeError} Формат ключа неизвестен.
 */
export function parseKey(data: unknown): OnlineConfKey {
  if (!isOnlineConfKey(data)) { throw new TypeError('Некорректный ключ OnlineConf'); }
  return data;
}

/**
 * Сравнивает ключи по составному идентификатору.
 * @param left Первый ключ.
 * @param right Второй ключ.
 * @returns Совпадают ли область и название.
 */
export function sameKey(left: OnlineConfKey, right: OnlineConfKey): boolean {
  return left.scope === right.scope && left.name === right.name;
}
