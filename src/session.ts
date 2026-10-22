const listeners = new Set<() => void>();

// Сессия живёт в HttpOnly-cookie, из JavaScript её не видно — здесь хранится только факт входа.
let authorized = false;

/**
 * Узнаёт, вошёл ли пользователь.
 * @returns `true`, если бэкенд подтвердил сессию.
 */
export function isAuthorized(): boolean {
  return authorized;
}

/**
 * Запоминает, вошёл ли пользователь, и сообщает об изменении подписчикам.
 * @param value Вошёл ли пользователь.
 */
export function setAuthorized(value: boolean): void {
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
 * @param listener Вызывается, когда пользователь вошёл или вышел.
 */
export function onSessionChange(listener: () => void): void {
  listeners.add(listener);
}
