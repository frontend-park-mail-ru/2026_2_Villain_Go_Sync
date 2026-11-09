import { ApiError, getEmployer, getSeeker, type UserRole } from './api';
import { hasVisibleText } from '@hirenoon/validation';
import { getCurrentUser } from './session';
import noticeTemplate from './components/ProfileRequiredNotice.hbs';

/**
 * Проверяет, что ответ содержит настоящий профиль ожидаемого владельца.
 * @param profile Данные профиля из ответа сервера.
 * @param userId Идентификатор ожидаемого владельца.
 * @returns Есть ли корректный идентификатор владельца.
 */
export function isProfileForUser(profile: unknown, userId: number): boolean {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) { return false; }
  const data = profile as Record<string, unknown>;
  return typeof data.user_id === 'number' && Number.isSafeInteger(data.user_id) && data.user_id > 0 && data.user_id === userId;
}

/**
 * Отличает заполненный профиль текущего пользователя от пустого или чужого ответа API.
 * @param profile Данные профиля из ответа сервера.
 * @param userId Идентификатор ожидаемого владельца.
 * @param role Роль владельца.
 * @returns Принадлежит ли профиль пользователю и заполнено ли обязательное имя.
 */
export function isProfileComplete(profile: unknown, userId: number, role: UserRole): boolean {
  if (!isProfileForUser(profile, userId)) { return false; }
  const data = profile as Record<string, unknown>;
  const name = data[role === 'employer' ? 'company_name' : 'first_name'];
  return typeof name === 'string' && hasVisibleText(name);
}

/**
 * После отказа создания проверяет, действительно ли отсутствует профиль.
 * @param error Ошибка создания документа.
 * @param role Роль владельца формы.
 * @param signal Сигнал ухода со страницы.
 * @param form Форма с введёнными данными.
 * @returns Показано ли предложение заполнить профиль.
 */
export async function showMissingProfile(error: unknown, role: 'seeker' | 'employer', signal: AbortSignal, form: HTMLFormElement): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== (role === 'seeker' ? 404 : 403)) { return false; }
  try {
    if (await hasRequiredProfile(role, signal) || signal.aborted) { return false; }
    if (!form.querySelector('[data-profile-notice]')) {
      form.insertAdjacentHTML('afterbegin', noticeTemplate());
    }
    form.querySelector<HTMLButtonElement>('[data-action="complete-profile"]')?.focus();
    return true;
  } catch { return false; }
}

/**
 * Проверяет наличие профиля нужной роли перед созданием документа.
 * @param role Роль владельца формы.
 * @param signal Сигнал отмены загрузки.
 * @returns Есть ли профиль; остальные ошибки передаются вызывающей странице.
 */
export async function hasRequiredProfile(role: 'seeker' | 'employer', signal: AbortSignal): Promise<boolean> {
  const user = getCurrentUser();
  if (!user || user.id === null || user.role !== role) {
    throw new ApiError(403);
  }
  try {
    const profile = await (role === 'seeker' ? getSeeker(user.id, { signal }) : getEmployer(user.id, { signal }));
    return isProfileComplete(profile, user.id, role);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Разрешает возврат из профиля только на две страницы создания.
 * @param search Строка параметров адреса.
 * @returns Безопасный внутренний путь.
 */
export function profileReturnPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next === '/resumes/new' || next === '/vacancies/new' ? next : '/profile';
}
