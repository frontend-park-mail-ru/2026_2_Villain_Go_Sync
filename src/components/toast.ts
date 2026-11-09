const HIDE_DELAY_MS = 5000;

/**
 * Убирает всплывающее уведомление, если оно показано.
 */
export function hideToast(): void {
  document.querySelector('.toast_floating')?.remove();
}

/**
 * Показывает всплывающее уведомление в углу экрана; предыдущее при этом убирается.
 * @param message Текст уведомления.
 * @param type Вид уведомления.
 */
export function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  hideToast();

  const toast = document.createElement('div');
  const text = document.createElement('span');
  const close = document.createElement('button');

  toast.className = `toast toast_floating toast_${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  text.className = 'toast__message';
  text.textContent = message;

  close.className = 'toast__close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Закрыть');

  const timer = setTimeout(() => toast.remove(), HIDE_DELAY_MS);

  close.addEventListener('click', () => {
    clearTimeout(timer);
    toast.remove();
  });

  // У уведомления об ошибке в макете нет кнопки закрытия: оно исчезает само.
  toast.append(...(type === 'success' ? [text, close] : [text]));
  // Открытое модальное окно лежит поверх всей страницы, поэтому уведомление кладём внутрь него, иначе его закроет затемнение.
  (document.querySelector('dialog[open]') ?? document.body).append(toast);
}
