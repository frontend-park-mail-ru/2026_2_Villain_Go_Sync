import { ApiError, register, type UserRole } from '../api';
import { initPasswordToggles, setFieldError, setLoading } from '../components/form';
import { showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getEmailError, getPasswordError } from '../validation';
import template from './RegisterPage.hbs';

/**
 * Поля формы регистрации.
 */
interface RegisterFormElements extends HTMLFormControlsCollection {
  /** Почта. */
  email: HTMLInputElement;
  /** Пароль. */
  password: HTMLInputElement;
  /** Переключатели роли. */
  role: RadioNodeList;
}

/**
 * Страница регистрации.
 */
export default class RegisterPage implements Page {
  #router: Router;
  #isSubmitting = false;
  #isDestroyed = false;

  /**
   * @param props Параметры страницы.
   * @param props.router Роутер для перехода после регистрации.
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
   * Проверяет поля и отправляет форму регистрации.
   * @param form Форма регистрации.
   */
  async #submit(form: HTMLFormElement): Promise<void> {
    if (this.#isSubmitting) {
      return;
    }

    const { email, password, role } = form.elements as RegisterFormElements;
    const roleError = role.value ? '' : 'Выберите, кто вы';
    const emailError = getEmailError(email.value.trim());
    const passwordError = getPasswordError(password.value);

    if (roleError || emailError || passwordError) {
      setFieldError(role[0] as Element, roleError);
      setFieldError(email, emailError);
      setFieldError(password, passwordError);
      return;
    }

    const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;

    this.#isSubmitting = true;
    setLoading(button, true);

    try {
      await register({ email: email.value.trim(), password: password.value, role: role.value as UserRole });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(email, error.message);
      } else {
        showToast((error as Error).message, 'error');
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
