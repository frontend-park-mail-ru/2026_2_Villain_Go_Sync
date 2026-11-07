import { getEmployer, getSeeker, profileImageURL, saveProfileImage, type UserRole } from '../api';
import template from './ProfileImage.hbs';

/**
 * Подключает загрузку и удаление изображения в форме сохранённого профиля.
 * @param container Контейнер поля.
 * @param user Владелец профиля.
 * @param user.id Идентификатор пользователя.
 * @param user.role Роль пользователя.
 * @param path Текущий путь изображения.
 * @param signal Сигнал ухода со страницы.
 */
export function mountProfileImage(container: HTMLElement, user: { id: number; role: UserRole }, path: string | null | undefined, signal: AbortSignal): void {
  container.innerHTML = template({ label: user.role === 'employer' ? 'Логотип компании' : 'Фотография', url: profileImageURL(path) });
  const input = container.querySelector<HTMLInputElement>('input')!;
  const remove = container.querySelector<HTMLButtonElement>('button')!;
  const image = container.querySelector<HTMLImageElement>('img')!;
  const message = container.querySelector<HTMLElement>('[role="status"]')!;
  image.addEventListener('error', () => { image.hidden = true; }, { signal });
  const save = async (file: File | null): Promise<void> => {
    if (input.disabled) { return; }
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024)) {
      message.textContent = 'Выберите PNG, JPEG или WebP размером от 1 байта до 10 МБ.';
      input.value = '';
      return;
    }
    input.disabled = remove.disabled = true;
    message.textContent = 'Сохранение…';
    try {
      await saveProfileImage(user.role, file);
      if (signal.aborted) { return; }
      const profile = user.role === 'employer' ? await getEmployer(user.id, { signal }) : await getSeeker(user.id, { signal });
      if (signal.aborted) { return; }
      const url = profileImageURL('logo_url' in profile ? profile.logo_url : 'avatar_url' in profile ? profile.avatar_url : null);
      image.hidden = remove.hidden = !url;
      if (url) { image.src = `${url}?v=${Date.now()}`; }
      message.textContent = file ? 'Изображение сохранено.' : 'Изображение удалено.';
    } catch {
      if (!signal.aborted) { message.textContent = 'Не удалось сохранить изображение. Попробуйте ещё раз.'; }
    } finally {
      input.disabled = remove.disabled = false;
      input.value = '';
    }
  };
  input.addEventListener('change', () => { const file = input.files?.[0]; if (file) { void save(file); } }, { signal });
  remove.addEventListener('click', () => { void save(null); }, { signal });
}
