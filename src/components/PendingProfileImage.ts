import { saveProfileImage, type UserRole } from '../api';
import { getProfileImageError } from '@hirenoon/validation';
import template from './ProfileImage.hbs';
import { notifyProfileImageChange, publicProfileImage } from './profile-images';

/** Изображение, выбранное до первого сохранения профиля. */
export interface PendingProfileImage {
  /** Есть ли ещё не отправленный файл. */
  hasChanges(): boolean;
  /** Загружает файл после создания профиля, сохраняя выбор при ошибке. */
  save(): Promise<boolean>;
}

/**
 * Подключает выбор и предпросмотр изображения до создания профиля.
 * @param container Контейнер поля.
 * @param user Владелец профиля.
 * @param user.id Идентификатор владельца.
 * @param user.role Роль владельца.
 * @param signal Сигнал ухода со страницы.
 * @returns Управление отложенной загрузкой.
 */
export function mountPendingProfileImage(container: HTMLElement, user: { id: number; role: UserRole }, signal: AbortSignal): PendingProfileImage {
  container.innerHTML = template({ label: user.role === 'employer' ? 'Логотип компании' : 'Фотография', deferred: true });
  const input = container.querySelector<HTMLInputElement>('input')!;
  const image = container.querySelector<HTMLImageElement>('img')!;
  const remove = container.querySelector<HTMLButtonElement>('button')!;
  const message = container.querySelector<HTMLElement>('[role="status"]')!;
  let file: File | null = null;
  let previewURL: string | null = null;
  let saving = false;
  const clearPreview = (): void => {
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
  };
  const reset = (): void => {
    file = null;
    clearPreview();
    image.removeAttribute('src');
    image.hidden = remove.hidden = true;
    input.value = '';
  };
  signal.addEventListener('abort', clearPreview, { once: true });
  image.addEventListener('error', () => { image.hidden = true; }, { signal });
  input.addEventListener('change', () => {
    const selected = input.files?.[0];
    if (!selected || saving) { return; }
    const error = getProfileImageError(selected);
    if (error) { reset(); message.textContent = error; return; }
    clearPreview();
    file = selected;
    previewURL = URL.createObjectURL(file);
    image.src = previewURL;
    image.hidden = remove.hidden = false;
    message.textContent = 'Изображение выбрано. Нажмите «Сохранить», чтобы загрузить его вместе с профилем.';
  }, { signal });
  remove.addEventListener('click', () => {
    if (!saving) { reset(); message.textContent = 'Выбор изображения отменён.'; }
  }, { signal });
  return {
    hasChanges: () => file !== null,
    save: async () => {
      if (!file) { return true; }
      if (saving || signal.aborted) { return false; }
      saving = true;
      input.disabled = remove.disabled = true;
      message.textContent = 'Сохранение…';
      try {
        await saveProfileImage(user.role, file);
        file = null;
        clearPreview();
        const url = `${publicProfileImage(user.id, user.role)}?v=${Date.now()}`;
        notifyProfileImageChange({ ...user, url });
        if (!signal.aborted) { image.src = url; message.textContent = 'Изображение сохранено.'; }
        return true;
      } catch {
        if (!signal.aborted) { message.textContent = 'Профиль сохранён, но изображение загрузить не удалось. Нажмите «Сохранить», чтобы повторить'; }
        return false;
      } finally {
        saving = false;
        input.disabled = remove.disabled = false;
      }
    },
  };
}
