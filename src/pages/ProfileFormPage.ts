import { mountProfileImage } from '../components/ProfileImage';
import { mountPendingProfileImage, type PendingProfileImage } from '../components/PendingProfileImage';
import { profileReturnPath } from '../profile-required';
import {
  ApiError,
  getEmployer,
  getSeeker,
  saveEmployerProfile,
  saveSeekerProfile,
  type Employer,
  type Seeker,
} from '../api';
import { setFieldError, setLoading } from '../components/form';
import { confirmAction } from '../components/Modal';
import { hideToast, showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getCurrentUser } from '../session';
import { getPhoneError, normalizeWebsite, hasVisibleText } from '@hirenoon/validation';
import template from './ProfileFormPage.hbs';

const SKELETON_FIELDS = 3;

/**
 * Поля формы профиля; набор зависит от роли, поэтому все они необязательные.
 */
interface ProfileFormElements extends HTMLFormControlsCollection {
  /** Имя соискателя. */
  firstName?: HTMLInputElement;
  /** Фамилия соискателя. */
  lastName?: HTMLInputElement;
  /** Телефон соискателя. */
  phone?: HTMLInputElement;
  /** Название компании. */
  companyName?: HTMLInputElement;
  /** Сайт компании. */
  website?: HTMLInputElement;
  /** Рассказ о себе или о компании. */
  description: HTMLTextAreaElement;
}

/**
 * Страница редактирования профиля соискателя или компании.
 */
export default class ProfileFormPage implements Page {
  #router: Router;
  #backPath = profileReturnPath(window.location.search);
  #abortController = new AbortController();
  #container!: HTMLElement;
  #form: HTMLFormElement | null = null;
  #isCompany = false;
  /** Значения полей при открытии формы — чтобы понять, есть ли несохранённые изменения. */
  #initialValues = '';
  #isSubmitting = false;
  #isDestroyed = false;
  #pendingImage: PendingProfileImage | null = null;

  /**
   * @param props Параметры страницы.
   * @param props.router Роутер для перехода после сохранения или отмены.
   */
  constructor({ router }: PageProps) {
    this.#router = router;
  }

  /**
   * Загружает профиль и рисует форму.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    this.#container = container;

    // Контейнер общий для всех страниц, поэтому обработчики снимаются в destroy через signal.
    const { signal } = this.#abortController;

    container.addEventListener(
      'click',
      (event) => {
        const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;

        if (action === 'retry') {
          this.#load();
        } else if (action === 'cancel') {
          this.#cancel();
        }
      },
      { signal },
    );

    container.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        this.#submit();
      },
      { signal },
    );

    container.addEventListener('input', (event) => setFieldError(event.target as Element, ''), { signal });

    this.#load();
  }

  /**
   * Вызывается при уходе со страницы: отменяет загрузку.
   */
  destroy(): void {
    this.#isDestroyed = true;
    this.#abortController.abort();
  }

  /**
   * Сообщает роутеру о несохранённых текстовых полях.
   * @returns Есть ли изменения формы.
   */
  hasUnsavedChanges(): boolean {
    return this.#form !== null && (this.#snapshot() !== this.#initialValues || Boolean(this.#pendingImage?.hasChanges()));
  }

  /**
   * Загружает текущий профиль; если его ещё нет, показывает пустую форму.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;
    const user = getCurrentUser();

    this.#isCompany = user?.role === 'employer';

    const heading = this.#isCompany ? 'Профиль компании' : 'Профиль';

    if (!user || user.id === null || user.role === null) {
      this.#form = null;
      this.#container.innerHTML = template({ heading, error: 'Не удалось узнать, кто вошёл в аккаунт.' });
      return;
    }

    this.#container.innerHTML = template({
      heading,
      isLoading: true,
      skeletonFields: Array.from({ length: SKELETON_FIELDS }),
    });

    let profile: Seeker | Employer | null;

    try {
      profile = this.#isCompany ? await getEmployer(user.id, { signal }) : await getSeeker(user.id, { signal });
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      // 404 — профиль ещё не заполняли, форма будет пустой.
      if (!(error instanceof ApiError && error.status === 404)) {
        this.#form = null;
        this.#container.innerHTML = template({ heading, error: (error as Error).message, canRetry: true });
        return;
      }

      profile = null;
    }

    this.#container.innerHTML = template({ heading, profile, isCompany: this.#isCompany });
    this.#form = this.#container.querySelector<HTMLFormElement>('.edit-form');
    this.#initialValues = this.#snapshot();
    const container = document.createElement('div');
    this.#form!.prepend(container);
    if (profile) {
      mountProfileImage(container, { id: user.id, role: user.role }, this.#isCompany ? (profile as Employer).logo_url : (profile as Seeker).avatar_url, signal);
    } else {
      this.#pendingImage = mountPendingProfileImage(container, { id: user.id, role: user.role }, signal);
    }
  }

  /**
   * Собирает текущие значения полей в строку, чтобы сравнить их с исходными.
   * @returns Значения полей без пробелов по краям.
   */
  #snapshot(): string {
    const fields = [...this.#form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="file"]), textarea')];

    return JSON.stringify(fields.map((field) => field.value.trim()));
  }

  /**
   * Уходит на страницу профиля; если в форме есть изменения, сначала спрашивает подтверждение.
   */
  async #cancel(): Promise<void> {
    if (this.hasUnsavedChanges()) {
      const isConfirmed = await confirmAction({
        title: 'Отменить изменения?',
        text: 'Несохранённые изменения будут потеряны.',
        confirmLabel: 'Отменить',
        cancelLabel: 'Остаться',
      });

      if (!isConfirmed || this.#isDestroyed) {
        return;
      }
    }

    this.#router.navigate(this.#backPath, { force: true });
  }

  /**
   * Проверяет поля и показывает ошибки под ними.
   * @returns Сохранение профиля или `null`, если есть ошибки.
   */
  #validate(): (() => Promise<void>) | null {
    const elements = this.#form!.elements as ProfileFormElements;
    const value = (field?: HTMLInputElement | HTMLTextAreaElement): string => field?.value.trim() ?? '';
    const errors = new Map<HTMLInputElement, string>();
    let save: () => Promise<void>;

    if (this.#isCompany) {
      const { companyName, website } = elements as Required<ProfileFormElements>;
      const normalizedWebsite = normalizeWebsite(value(website));

      if (!hasVisibleText(value(companyName))) {
        errors.set(companyName, 'Введите название компании.');
      }

      if (normalizedWebsite === null) {
        errors.set(website, 'Введите корректный адрес сайта.');
      }

      save = () =>
        saveEmployerProfile({
          company_name: value(companyName),
          description: value(elements.description),
          website: normalizedWebsite ?? '',
        });
    } else {
      const { firstName, lastName, phone } = elements as Required<ProfileFormElements>;
      const phoneError = getPhoneError(value(phone));

      if (!hasVisibleText(value(firstName))) {
        errors.set(firstName, 'Введите имя.');
      }

      if (phoneError) {
        errors.set(phone, phoneError);
      }

      save = () =>
        saveSeekerProfile({
          first_name: value(firstName),
          last_name: value(lastName),
          phone: value(phone),
          description: value(elements.description),
        });
    }

    for (const field of this.#form!.querySelectorAll<HTMLInputElement>('input:not([type="file"])')) {
      setFieldError(field, errors.get(field) ?? '');
    }

    if (errors.size > 0) {
      errors.keys().next().value?.focus();
      return null;
    }

    return save;
  }

  /**
   * Проверяет поля и сохраняет профиль.
   */
  async #submit(): Promise<void> {
    if (this.#isSubmitting || !this.#form) {
      return;
    }

    hideToast();

    const save = this.#validate();

    if (!save) {
      return;
    }

    const button = this.#form.querySelector<HTMLButtonElement>('[type="submit"]')!;

    this.#isSubmitting = true;
    setLoading(button, true);

    try {
      await save();
      if (this.#isDestroyed) { return; }
      this.#initialValues = this.#snapshot();
      if (this.#pendingImage && !(await this.#pendingImage.save())) { return; }
    } catch {
      if (!this.#isDestroyed) { showToast('Не удалось сохранить профиль. Попробуйте ещё раз.', 'error'); }
      return;
    } finally {
      this.#isSubmitting = false;
      setLoading(button, false);
    }

    if (!this.#isDestroyed) {
      this.#router.navigate(this.#backPath, { force: true });
    }
  }
}
