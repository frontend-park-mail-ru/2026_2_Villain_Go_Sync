const STORAGE_KEY = 'hirenoon.tokens';

/**
 * @typedef {object} TokenPair
 * @property {string} access_token JWT для запросов к API.
 * @property {string} refresh_token JWT для обновления пары токенов.
 */

/**
 * @typedef {'seeker' | 'employer'} UserRole
 */

/**
 * @typedef {object} SessionUser
 * @property {number} id Идентификатор пользователя.
 * @property {UserRole} role Роль: соискатель или работодатель.
 */

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * Сообщает подписчикам, что пользователь вошёл или вышел.
 */
function notify() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Читает пару токенов из localStorage.
 * @returns {TokenPair | null} Токены или `null`, если их нет или хранилище недоступно.
 */
function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Достаёт данные из JWT без проверки подписи: её проверяет бэкенд.
 * @param {string} token JWT.
 * @returns {{ uid: number, role: UserRole, exp: number } | null} Данные токена или `null`, если он повреждён.
 */
function decodeToken(token) {
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');

    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/**
 * Возвращает данные access-токена, пока он не истёк.
 * @returns {{ token: string, claims: { uid: number, role: UserRole, exp: number } } | null} Токен с данными или `null`.
 */
function getActiveAccess() {
  const token = readTokens()?.access_token;
  const claims = token ? decodeToken(token) : null;

  if (!claims || claims.exp * 1000 <= Date.now()) {
    return null;
  }

  return { token, claims };
}

/**
 * Сохраняет токены после входа или регистрации.
 * @param {TokenPair} tokens Пара токенов от бэкенда.
 */
export function saveTokens(tokens) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Хранилище недоступно — сессия не переживёт перезагрузку страницы.
  }

  notify();
}

/**
 * Удаляет токены — так выглядит выход: на бэкенде сессий нет.
 */
export function clearTokens() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Хранилище недоступно — удалять нечего.
  }

  notify();
}

/**
 * Подписывает на вход и выход пользователя.
 * @param {() => void} listener Вызывается после сохранения или удаления токенов.
 */
export function onSessionChange(listener) {
  listeners.add(listener);
}

/**
 * Возвращает access-токен для заголовка `Authorization`.
 * @returns {string | null} Токен или `null`, если его нет или он истёк.
 */
export function getAccessToken() {
  return getActiveAccess()?.token ?? null;
}

/**
 * Узнаёт по access-токену, кто вошёл.
 * @returns {SessionUser | null} Пользователь или `null`, если сессии нет или токен истёк.
 */
export function getCurrentUser() {
  const access = getActiveAccess();

  return access ? { id: access.claims.uid, role: access.claims.role } : null;
}
