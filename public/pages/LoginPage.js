import { login } from '../api.js';
import { setFieldError, setFormError, setLoading } from '../components/form.js';
import { loadTemplate } from '../template.js';
import { getEmailError } from '../validation.js';

const template = await loadTemplate(new URL('./LoginPage.hbs', import.meta.url));

const INVALID_CREDENTIALS_MESSAGE = 'Неверный email или пароль';

/**
 * Страница авторизации.
 */
export default class LoginPage {
  #router;
  #isSubmitting = false;
  #isDestroyed = false;

  /**
   * @param {object} props Параметры страницы.
   * @param {import('../router.js').default} props.router Роутер для перехода после входа.
   */
  constructor({ router }) {
    this.#router = router;
  }

  /**
   * Рисует страницу в контейнер.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template();

    const form = container.querySelector('.auth__form');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit(form, container.querySelector('.toast'));
    });
    form.addEventListener('input', (event) => setFieldError(event.target, ''));
  }

  /**
   * Вызывается при уходе со страницы.
   */
  destroy() {
    this.#isDestroyed = true;
  }

  /**
   * Проверяет поля и отправляет форму входа.
   * @param {HTMLFormElement} form Форма входа.
   * @param {HTMLElement} toast Уведомление об ошибке отправки.
   */
  async #submit(form, toast) {
    if (this.#isSubmitting) {
      return;
    }

    const { email, password } = form.elements;
    const emailError = getEmailError(email.value.trim());
    const passwordError = password.value ? '' : 'Введите пароль';

    setFormError(toast, '');
    setFieldError(email, emailError);
    setFieldError(password, passwordError);

    if (emailError || passwordError) {
      return;
    }

    const button = form.querySelector('[type="submit"]');

    this.#isSubmitting = true;
    setLoading(button, true);

    try {
      await login({ email: email.value.trim(), password: password.value });
    } catch (error) {
      // 422 при входе значит, что пароль не подходит под правила бэкенда, то есть заведомо неверный.
      setFormError(toast, error.status === 422 ? INVALID_CREDENTIALS_MESSAGE : error.message);
      return;
    } finally {
      this.#isSubmitting = false;
      setLoading(button, false);
    }

    if (!this.#isDestroyed) {
      this.#router.navigate('/');
    }
  }
}
