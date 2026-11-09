import { API_URL } from '../config';
import type { UserRole } from '../api';
import { profileImageURL } from '../api';

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
const MAX_CACHED_IMAGE_GROUPS = 48;
const cardImages = new WeakMap<HTMLElement, Map<string, HTMLElement[]>>();

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
  container.classList.remove('image-frame_loading');
  const placeholder = document.createElement('span');
  placeholder.setAttribute('aria-hidden', 'true');
  if (typeof fallback === 'string') {
    placeholder.textContent = fallback || '?';
  } else {
    placeholder.className = `image-frame__placeholder image-frame__placeholder_${fallback.role}`;
  }
  container.append(placeholder);
  if (!url) { return; }
  placeholder.hidden = true;
  container.classList.add('image-frame_loading');
  const image = document.createElement('img');
  image.alt = '';
  image.style.opacity = '0';
  if (lazy) { image.loading = 'lazy'; }
  const showImage = (): void => {
    if (image.parentElement !== container) { return; }
    image.style.opacity = '1';
    container.classList.remove('image-frame_loading');
  };
  image.addEventListener('load', showImage, { once: true });
  image.addEventListener('error', () => {
    if (image.parentElement !== container) { return; }
    image.remove();
    placeholder.hidden = false;
    container.classList.remove('image-frame_loading');
  }, { once: true });
  container.append(image);
  image.src = url;
  if (image.complete && image.naturalWidth > 0) { showImage(); }
}

/**
 * Подключает изображения карточек и сохраняет их элементы при поиске и пагинации.
 * @param container Контейнер карточек.
 */
export function mountCardImages(container: HTMLElement): void {
  let cache = cardImages.get(container);
  if (!cache) { cache = new Map(); cardImages.set(container, cache); }
  for (const frames of cache.values()) {
    for (const frame of frames) {
      if (!container.contains(frame)) { frame.remove(); }
    }
  }
  const used = new Map<string, number>();
  for (const element of container.querySelectorAll<HTMLElement>('[data-image-url]')) {
    const url = profileImageURL(element.dataset.imageUrl);
    const fallback = element.textContent?.trim().slice(0, 2) || '?';
    if (!url) { mountImage(element, '', fallback); continue; }
    const classes = [...element.classList].filter((name) => !name.startsWith('image-frame')).join(' ');
    const key = JSON.stringify([url, classes, fallback]);
    const frames = cache.get(key) ?? [];
    const index = used.get(key) ?? 0;
    const existing = frames[index];
    if (existing?.querySelector('img')) {
      if (existing !== element) { element.replaceWith(existing); }
    } else {
      mountImage(element, url, fallback, true);
      frames[index] = element;
    }
    used.set(key, index + 1);
    cache.delete(key);
    cache.set(key, frames);
    // Храним ограниченный запас картинок; после удаления контейнера кэш освобождается вместе с ним.
    while (cache.size > MAX_CACHED_IMAGE_GROUPS) { cache.delete(cache.keys().next().value!); }
  }
}
