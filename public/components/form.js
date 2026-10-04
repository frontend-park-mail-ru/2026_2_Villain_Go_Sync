const LOADING_LABEL = 'Loading…';

/**
 * Показывает ошибку под полем или возвращает исходную подсказку.
 * @param {HTMLElement} control Поле ввода или любой элемент внутри блока `.field`.
 * @param {string} message Текст ошибки; пустая строка убирает ошибку.
 */
export function setFieldError(control, message) {
  const field = control.closest('.field');
  const messageElement = field.querySelector('.field__message');

  messageElement.dataset.hint ??= messageElement.textContent;
  messageElement.textContent = message || messageElement.dataset.hint;
  field.classList.toggle('field_invalid', Boolean(message));

  if (control instanceof HTMLInputElement) {
    control.setAttribute('aria-invalid', String(Boolean(message)));
  }
}

/**
 * Показывает или прячет уведомление об ошибке отправки формы.
 * @param {HTMLElement} toast Элемент уведомления.
 * @param {string} message Текст ошибки; пустая строка прячет уведомление.
 */
export function setFormError(toast, message) {
  toast.textContent = message;
  toast.hidden = !message;
}

/**
 * Переводит кнопку отправки в состояние загрузки и обратно.
 * @param {HTMLButtonElement} button Кнопка отправки.
 * @param {boolean} isLoading Идёт ли отправка.
 */
export function setLoading(button, isLoading) {
  button.dataset.label ??= button.textContent;
  button.textContent = isLoading ? LOADING_LABEL : button.dataset.label;
  button.classList.toggle('button_loading', isLoading);
  button.setAttribute('aria-busy', String(isLoading));
}
