import { login } from '../api.js';
import { initPasswordToggles, setFieldError, setLoading } from '../components/form.js';
import { showToast } from '../components/toast.js';
import { loadTemplate } from '../template.js';
import { getEmailError } from '../validation.js';

const template = await loadTemplate(new URL('./LoginPage.hbs', import.meta.url));

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
      this.#submit(form);
    });
    form.addEventListener('input', (event) => setFieldError(event.target, ''));
    initPasswordToggles(form);
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
   */
  async #submit(form) {
    if (this.#isSubmitting) {
      return;
    }

    const { email, password } = form.elements;
    const emailError = getEmailError(email.value.trim());
    const passwordError = password.value ? '' : 'Введите пароль';

    if (emailError || passwordError) {
      setFieldError(email, emailError);
      setFieldError(password, passwordError);
      return;
    }

    const button = form.querySelector('[type="submit"]');

    this.#isSubmitting = true;
    setLoading(button, true);

    try {
      await login({ email: email.value.trim(), password: password.value });
    } catch (error) {
      showToast(error.message, 'error');
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
