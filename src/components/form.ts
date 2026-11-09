import { countCharacters } from '@hirenoon/validation';

const LOADING_LABEL = 'Загрузка…';

/**
 * Обновляет счётчики и ошибки текстовых полей, не обрезая ввод.
 * @param form Форма с текстовыми полями.
 * @param limits Лимиты по именам полей.
 * @param validate Проверка значения поля.
 * @param changed Изменённое поле; без него обновляются все поля формы.
 */
export function updateTextFields<T extends string>(
  form: HTMLFormElement,
  limits: Readonly<Record<T, number>>,
  validate: (name: NoInfer<T>, value: string) => string,
  changed?: Element,
): void {
  for (const field of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="file"]), textarea')) {
    const name = field.name as T;
    const limit = limits[name];
    if (typeof limit !== 'number' || (changed && changed !== field)) { continue; }
    const counter = field.closest('.field')?.querySelector<HTMLElement>('.field__counter');
    if (counter) { counter.textContent = `${countCharacters(field.value)} / ${limit} символов`; }
    setFieldError(field, field.value || changed ? validate(name, field.value) : '');
  }
}

/**
 * Показывает ошибку под полем или возвращает исходную подсказку.
 * @param control Поле ввода или любой элемент внутри блока `.field`.
 * @param message Текст ошибки; пустая строка убирает ошибку.
 */
export function setFieldError(control: Element, message: string): void {
  const field = control.closest('.field');
  const messageElement = field?.querySelector<HTMLElement>('.field__message');

  if (!field || !messageElement) {
    return;
  }


  messageElement.dataset.hint ??= messageElement.textContent;
  messageElement.textContent = message || messageElement.dataset.hint;
  field.classList.toggle('field_invalid', Boolean(message));

  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.setAttribute('aria-invalid', String(Boolean(message)));
  }
}

/**
 * Подсвечивает поле как ошибочное без текста под ним: текст ошибки показывается во всплывающем уведомлении.
 * @param control Поле ввода или любой элемент внутри блока `.field`.
 * @param isInvalid Есть ли ошибка.
 */
export function setFieldInvalid(control: Element, isInvalid: boolean): void {
  control.closest('.field')?.classList.toggle('field_invalid', isInvalid);

  if (control instanceof HTMLInputElement) {
    control.setAttribute('aria-invalid', String(isInvalid));
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
      button.setAttribute('aria-label', isVisible ? 'Скрыть пароль' : 'Показать пароль');
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
