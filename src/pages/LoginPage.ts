import { login } from '../api';
import { initPasswordToggles, setFieldError, setLoading } from '../components/form';
import { showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getEmailError } from '../validation';
import template from './LoginPage.hbs';

/**
 * Поля формы входа.
 */
interface LoginFormElements extends HTMLFormControlsCollection {
  /** Почта. */
  email: HTMLInputElement;
  /** Пароль. */
  password: HTMLInputElement;
}

/**
 * Страница авторизации.
 */
export default class LoginPage implements Page {
  #router: Router;
  #isSubmitting = false;
  #isDestroyed = false;

  /**
   * @param props Параметры страницы.
   * @param props.router Роутер для перехода после входа.
   */
  constructor({ router }: PageProps) {
    this.#router = router;
  }

  /**
   * Рисует страницу в контейнер.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    container.innerHTML = template();

    const form = container.querySelector<HTMLFormElement>('.auth__form')!;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit(form);
    });
    form.addEventListener('input', (event) => setFieldError(event.target as Element, ''));
    initPasswordToggles(form);
  }

  /**
   * Вызывается при уходе со страницы.
   */
  destroy(): void {
    this.#isDestroyed = true;
  }

  /**
   * Проверяет поля и отправляет форму входа.
   * @param form Форма входа.
   */
  async #submit(form: HTMLFormElement): Promise<void> {
    if (this.#isSubmitting) {
      return;
    }

    const { email, password } = form.elements as LoginFormElements;
    const emailError = getEmailError(email.value.trim());
    const passwordError = password.value ? '' : 'Введите пароль';

    if (emailError || passwordError) {
      setFieldError(email, emailError);
      setFieldError(password, passwordError);
      return;
    }

    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;

    this.#isSubmitting = true;
    setLoading(button, true);

    try {
      await login({ email: email.value.trim(), password: password.value });
    } catch (error) {
      showToast((error as Error).message, 'error');
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
