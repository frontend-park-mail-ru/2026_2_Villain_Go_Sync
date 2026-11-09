import type { UserRole } from './api';

/**
 * Вошедший пользователь в том виде, в каком его знает фронтенд.
 */
export interface SessionUser {
  /** Идентификатор пользователя; `null`, если бэкенд его не сообщил. */
  id: number | null;
  /** Роль; `null`, если ответ сервера не содержит известную роль. */
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
  const previous = currentUser;

  currentUser = user;

  if (previous?.id === user?.id && previous?.role === user?.role && (previous === null) === (user === null)) {
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
