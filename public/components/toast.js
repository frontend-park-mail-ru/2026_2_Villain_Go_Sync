const HIDE_DELAY_MS = 5000;

/**
 * Показывает всплывающее уведомление в углу экрана; предыдущее при этом убирается.
 * @param {string} message Текст уведомления.
 */
export function showSuccessToast(message) {
  document.querySelector('.toast_floating')?.remove();

  const toast = document.createElement('div');
  const text = document.createElement('span');
  const close = document.createElement('button');

  toast.className = 'toast toast_success toast_floating';
  toast.setAttribute('role', 'status');

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

  toast.append(text, close);
  document.body.append(toast);
}
