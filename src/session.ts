import type { UserRole } from './api';

/**
 * Вошедший пользователь в том виде, в каком его знает фронтенд.
 */
export interface SessionUser {
  /** Идентификатор пользователя; `null`, если бэкенд его не сообщил. */
  id: number | null;
  /** Роль; `null`, пока бэкенд её не отдаёт. */
  role: UserRole | null;
}

const listeners = new Set<() => void>();

// Сессия живёт в HttpOnly-cookie, из JavaScript её не видно — здесь хранится только то, что сообщил бэкенд.
let currentUser: SessionUser | null = null;

/**
 * Узнаёт, вошёл ли пользователь.
 * @returns `true`, если бэкенд подтвердил сессию.
 */
export function isAuthorized(): boolean {
  return currentUser !== null;
}

/**
 * Возвращает вошедшего пользователя.
 * @returns Пользователь или `null`, если это гость.
 */
export function getCurrentUser(): SessionUser | null {
  return currentUser;
}

/**
 * Запоминает вошедшего пользователя и сообщает подписчикам, если вход или выход изменился.
 * @param user Пользователь или `null`, если сессии нет.
 */
export function setCurrentUser(user: SessionUser | null): void {
  const wasAuthorized = isAuthorized();

  currentUser = user;

  if (wasAuthorized === isAuthorized()) {
    return;
  }

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
