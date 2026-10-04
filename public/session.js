/** @type {Set<() => void>} */
const listeners = new Set();

// Сессия живёт в HttpOnly-cookie, из JavaScript её не видно — здесь хранится только факт входа.
let authorized = false;

/**
 * Узнаёт, вошёл ли пользователь.
 * @returns {boolean} `true`, если бэкенд подтвердил сессию.
 */
export function isAuthorized() {
  return authorized;
}

/**
 * Запоминает, вошёл ли пользователь, и сообщает об изменении подписчикам.
 * @param {boolean} value Вошёл ли пользователь.
 */
export function setAuthorized(value) {
  if (authorized === value) {
    return;
  }

  authorized = value;

  for (const listener of listeners) {
    listener();
  }
}

/**
 * Подписывает на вход и выход пользователя.
 * @param {() => void} listener Вызывается, когда пользователь вошёл или вышел.
 */
export function onSessionChange(listener) {
  listeners.add(listener);
}
