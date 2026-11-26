import { login, type Vacancy } from '../api';
import { getCurrentUser } from '../session';
import { showToast } from './toast';
import template from './FavoriteLogin.hbs';

/**
 * Проверяет сохранение вакансии в этом браузере для текущего пользователя.
 * @param id Вакансия.
 * @returns Статус избранного.
 */
export function isFavorite(id: number): boolean {
  try { return localStorage.getItem('hirenoon:favorite:' + getCurrentUser()?.id + ':' + id) === '1'; }
  catch { return false; }
}

/**
 * Переключает избранное у соискателя или показывает гостю окно входа.
 * @param vacancy Выбранная вакансия.
 * @param button Элемент управления избранным.
 */
export function toggleFavorite(vacancy: Vacancy, button: HTMLButtonElement): void {
  const user = getCurrentUser();
  if (!user) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = template(vacancy);
    const dialog = wrapper.querySelector('dialog')!;
    const form = dialog.querySelector('form')!;
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || (event.target as Element).closest('.modal__close')) { dialog.close(); }
    });
    dialog.querySelector('a')?.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button')!;
      if (submit.disabled) { return; }
      submit.disabled = true;
      const data = new FormData(form);
      try {
        await login({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
        if (getCurrentUser()?.role === 'seeker' && !isFavorite(vacancy.id)) { toggleFavorite(vacancy, button); }
        if (dialog.open) { dialog.close(); }
      } catch (error) { form.querySelector('[role=alert]')!.textContent = (error as Error).message; }
      finally { submit.disabled = false; }
    });
    document.body.append(dialog);
    dialog.showModal();
    return;
  }
  if (user.id === null || user.role !== 'seeker') { return; }
  const key = 'hirenoon:favorite:' + user.id + ':' + vacancy.id;
  const next = !isFavorite(vacancy.id);
  try {
    if (next) { localStorage.setItem(key, '1'); } else { localStorage.removeItem(key); }
  } catch { showToast('Не удалось сохранить избранное в браузере', 'error'); return; }
  button.setAttribute('aria-pressed', String(next));
  button.textContent = button.classList.contains('favorite-toggle') ? (next ? '♥' : '♡') : (next ? '♥ В избранном' : '♡ Сохранить в избранное');
}
