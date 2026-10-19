import { register } from '../api.js';
import { initPasswordToggles, setFieldError, setLoading } from '../components/form.js';
import { showToast } from '../components/toast.js';
import { loadTemplate } from '../template.js';
import { getEmailError, getPasswordError } from '../validation.js';

const template = await loadTemplate(new URL('./RegisterPage.hbs', import.meta.url));

/**
 * Страница регистрации.
 */
export default class RegisterPage {
  #router;
  #isSubmitting = false;
  #isDestroyed = false;

  /**
   * @param {object} props Параметры страницы.
   * @param {import('../router.js').default} props.router Роутер для перехода после регистрации.
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
   * Проверяет поля и отправляет форму регистрации.
   * @param {HTMLFormElement} form Форма регистрации.
   */
  async #submit(form) {
    if (this.#isSubmitting) {
      return;
    }

    const { email, password, role } = form.elements;
    const roleError = role.value ? '' : 'Выберите, кто вы';
    const emailError = getEmailError(email.value.trim());
    const passwordError = getPasswordError(password.value);

    if (roleError || emailError || passwordError) {
      setFieldError(role[0], roleError);
      setFieldError(email, emailError);
      setFieldError(password, passwordError);
      return;
    }

    const button = form.querySelector('[type="submit"]');

    this.#isSubmitting = true;
    setLoading(button, true);

    try {
      await register({ email: email.value.trim(), password: password.value, role: role.value });
    } catch (error) {
      if (error.status === 409) {
        setFieldError(email, error.message);
      } else {
        showToast(error.message, 'error');
      }
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
