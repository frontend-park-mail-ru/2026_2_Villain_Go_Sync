import { API_URL } from '../config';
import type { UserRole } from '../api';

/** Обновление изображения собственного профиля. */
export interface ProfileImageChange {
  /** Владелец изображения. */
  id: number;
  /** Роль владельца. */
  role: UserRole;
  /** Абсолютный адрес или пустая строка после удаления. */
  url: string;
}

const listeners = new Set<(change: ProfileImageChange) => void>();

/**
 * Подписывает шапку на замену изображения без перезагрузки страницы.
 * @param listener Обработчик изменения.
 */
export function onProfileImageChange(listener: (change: ProfileImageChange) => void): void {
  listeners.add(listener);
}

/**
 * Сообщает об успешной загрузке или удалении изображения.
 * @param change Новое изображение владельца.
 */
export function notifyProfileImageChange(change: ProfileImageChange): void {
  for (const listener of listeners) { listener(change); }
}

/**
 * Собирает адрес публичного изображения из идентификатора пользователя.
 * @param id Идентификатор владельца.
 * @param role Роль владельца.
 * @returns Адрес API или пустая строка при некорректном идентификаторе.
 */
export function publicProfileImage(id: number, role: UserRole): string {
  if (!Number.isSafeInteger(id) || id <= 0) { return ''; }
  return `${API_URL}/${role === 'employer' ? 'employers' : 'seekers'}/${id}/${role === 'employer' ? 'logo' : 'avatar'}`;
}

/**
 * Показывает изображение поверх заглушки только после успешной загрузки.
 * @param container Рамка изображения; подпись для доступности задаётся родителем.
 * @param url Адрес изображения.
 * @param fallback Инициалы или роль для иконки пустого профиля.
 * @param lazy Отложить загрузку изображений за пределами экрана.
 */
export function mountImage(container: HTMLElement, url: string, fallback: string | { role: UserRole }, lazy = false): void {
  container.replaceChildren();
  container.classList.add('image-frame');
  const placeholder = document.createElement('span');
  placeholder.setAttribute('aria-hidden', 'true');
  if (typeof fallback === 'string') {
    placeholder.textContent = fallback || '?';
  } else {
    placeholder.className = `image-frame__placeholder image-frame__placeholder_${fallback.role}`;
  }
  container.append(placeholder);
  if (!url) { return; }
  const image = document.createElement('img');
  image.alt = '';
  image.style.opacity = '0';
  if (lazy) { image.loading = 'lazy'; }
  image.addEventListener('load', () => { image.style.opacity = '1'; placeholder.hidden = true; }, { once: true });
  image.addEventListener('error', () => { image.remove(); placeholder.hidden = false; }, { once: true });
  container.append(image);
  image.src = url;
}

/**
 * Подключает изображения карточек без запросов полных профилей пользователей.
 * @param container Контейнер карточек.
 */
export function mountCardImages(container: HTMLElement): void {
  for (const element of container.querySelectorAll<HTMLElement>('[data-image-user]')) {
    const role = element.dataset.imageRole === 'seeker' ? 'seeker' : 'employer';
    mountImage(element, publicProfileImage(Number(element.dataset.imageUser), role), element.textContent?.trim().slice(0, 2) || '?', true);
  }
}
