import { ApiError, getEmployer, getSeeker } from './api';
import { getCurrentUser } from './session';

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
    await (role === 'seeker' ? getSeeker(user.id, { signal }) : getEmployer(user.id, { signal }));
    return true;
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
