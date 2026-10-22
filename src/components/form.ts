const LOADING_LABEL = 'Loading…';

/**
 * Показывает ошибку под полем или возвращает исходную подсказку.
 * @param control Поле ввода или любой элемент внутри блока `.field`.
 * @param message Текст ошибки; пустая строка убирает ошибку.
 */
export function setFieldError(control: Element, message: string): void {
  const field = control.closest('.field')!;
  const messageElement = field.querySelector<HTMLElement>('.field__message')!;

  messageElement.dataset.hint ??= messageElement.textContent;
  messageElement.textContent = message || messageElement.dataset.hint;
  field.classList.toggle('field_invalid', Boolean(message));

  if (control instanceof HTMLInputElement) {
    control.setAttribute('aria-invalid', String(Boolean(message)));
  }
}

/**
 * Подключает кнопки показа пароля `.field__toggle` внутри контейнера.
 * @param container Элемент, в котором ищутся кнопки.
 */
export function initPasswordToggles(container: HTMLElement): void {
  container.querySelectorAll('.field__toggle').forEach((button) => {
    const input = button.closest('.field__control')!.querySelector<HTMLInputElement>('.field__input')!;

    button.addEventListener('click', () => {
      const isVisible = input.type === 'password';

      input.type = isVisible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(isVisible));
    });
  });
}

/**
 * Переводит кнопку отправки в состояние загрузки и обратно.
 * @param button Кнопка отправки.
 * @param isLoading Идёт ли отправка.
 */
export function setLoading(button: HTMLButtonElement, isLoading: boolean): void {
  button.dataset.label ??= button.textContent;
  button.textContent = isLoading ? LOADING_LABEL : button.dataset.label;
  button.classList.toggle('button_loading', isLoading);
  button.setAttribute('aria-busy', String(isLoading));
}
