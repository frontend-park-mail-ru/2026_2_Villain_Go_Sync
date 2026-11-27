import { mountEditorDetails, readEditorDetails, validateEditorDetails } from '../components/editor-details';
import { mountFormSteps } from '../components/form-steps';
import { RESUME_FIELD_LIMITS, getResumeFieldError } from '@hirenoon/validation';
import { saveCreationDraft, restoreCreationDraft, clearCreationDraft, hasCreationDraft } from '../components/creation-draft';
import { getRequiredProfile, showMissingProfile } from '../profile-required';
import { ApiError, createResume, getResume, updateResume, type ResumeFields, type Seeker } from '../api';
import { setFieldError, setLoading, updateTextFields } from '../components/form';
import { confirmAction } from '../components/Modal';
import { hideToast, showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getCurrentUser } from '../session';
import template from './ResumeFormPage.hbs';

const SKELETON_FIELDS = 3;

/**
 * Поля формы резюме.
 */
interface ResumeFormElements extends HTMLFormControlsCollection {
  /** Название. */
  title: HTMLInputElement;
  /** Описание. */
  description: HTMLTextAreaElement;
  /** Опыт. */
  experience: HTMLTextAreaElement;
  /** Образование. */
  education: HTMLTextAreaElement;
}

/**
 * Страница создания резюме (`/resumes/new`) и его редактирования (`/resumes/:id/edit`).
 */
export default class ResumeFormPage implements Page {
  #router: Router;
  #profileData: Seeker | null = null;
  #copy = new URLSearchParams(location.search).get('copy');
  #draftPath = this.#copy === null ? '/resumes/new' : '/resumes/new?copy=' + encodeURIComponent(this.#copy);
  /** Идентификатор редактируемого резюме; `null` при создании. */
  #id: number | null;
  #abortController = new AbortController();
  #container!: HTMLElement;
  #form: HTMLFormElement | null = null;
  /** Значения полей при открытии формы — чтобы понять, есть ли несохранённые изменения. */
  #initialValues = '';
  #isSubmitting = false;
  #isDestroyed = false;

  /**
   * @param props Параметры страницы.
   * @param props.router Роутер для перехода после сохранения или отмены.
   * @param props.params Параметры пути; `id` есть только при редактировании.
   */
  constructor({ router, params }: PageProps) {
    this.#router = router;
    this.#id = params.id === undefined ? null : Number(params.id);
  }

  /**
   * Рисует форму; при редактировании сначала загружает резюме.
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
        } else if (action === 'complete-profile') {
          this.#completeProfile();
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

    container.addEventListener('input', (event) => {
      const field = event.target as Element;
      setFieldError(field, '');
      if (this.#form) { updateTextFields(this.#form, RESUME_FIELD_LIMITS, getResumeFieldError, field); }
    }, { signal });

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
    return this.#form !== null && JSON.stringify(this.#readFields()) !== this.#initialValues;
  }

  /**
   * Заголовок страницы для текущего режима.
   * @returns Заголовок.
   */
  get #heading(): string {
    return this.#id === null ? 'Создание резюме' : 'Редактирование резюме';
  }

  /**
   * Показывает пустую форму или загружает резюме для редактирования.
   */
  async #load(): Promise<void> {
    const sourceId = this.#id ?? (this.#copy === null ? null : Number(this.#copy));
    if (sourceId === null || (this.#id === null && hasCreationDraft(this.#draftPath))) {
      this.#form = null;
      this.#container.innerHTML = template({ isLoading: true, heading: this.#heading });
      try {
        const profile = await getRequiredProfile('seeker', this.#abortController.signal);
        if (this.#abortController.signal.aborted) { return; }
        if (!profile) {
          this.#container.innerHTML = template({ profileRequired: true, profilePath: '/profile/edit?next=' + encodeURIComponent(this.#draftPath) });
          return;
        }
        if ('first_name' in profile) { this.#profileData = profile; }
      } catch (error) {
        if (!this.#abortController.signal.aborted) {
          this.#container.innerHTML = template({ error: { title: 'Не удалось проверить профиль', text: (error as Error).message, canRetry: true } });
        }
        return;
      }
      if (this.#abortController.signal.aborted) { return; }
      this.#renderForm({ title: '', description: '', experience: '', education: '' });
      return;
    }

    const { signal } = this.#abortController;

    this.#container.innerHTML = template({
      isLoading: true,
      heading: this.#heading,
      skeletonFields: Array.from({ length: SKELETON_FIELDS }),
    });

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      this.#renderNotFound();
      return;
    }

    try {
      const resume = await getResume(sourceId, { signal });

      // Чужое резюме бэкенд всё равно не даст сохранить, поэтому для формы оно как будто не существует.
      if (resume.seeker_id !== getCurrentUser()?.id) {
        this.#renderNotFound();
        return;
      }

      this.#renderForm(resume);
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        this.#renderNotFound();
      } else {
        this.#container.innerHTML = template({
          error: { title: 'Не удалось загрузить резюме', text: (error as Error).message, canRetry: true },
        });
      }
    }
  }

  /**
   * Рисует форму с заполненными полями.
   * @param resume Значения полей.
   */
  #renderForm(resume: ResumeFields): void {
    this.#container.innerHTML = template({
      resume, canImport: Boolean(this.#profileData),
      heading: this.#heading,
      isEdit: this.#id !== null,
      submitLabel: this.#id === null ? 'Опубликовать резюме' : 'Сохранить изменения',
    });

    this.#form = this.#container.querySelector<HTMLFormElement>('.edit-form');
    mountEditorDetails(this.#form!, resume);
    this.#form!.querySelector('[data-from-profile]')?.addEventListener('click', async () => {
      const field = (this.#form!.elements as ResumeFormElements).description;
      const profile = this.#profileData;
      if (!profile) { return; }
      const groupNames = ['skills', 'experience_items', 'education_items', 'projects'] as const;
      const extras = readEditorDetails(this.#form!);
      const replaceExisting = Boolean(profile.description && field.value && field.value !== profile.description)
        || groupNames.some((name) => profile[name]?.length && Array.isArray(extras[name]) && extras[name].length > 0);
      if (replaceExisting && !(await confirmAction({ title: 'Заполнить из профиля?', text: 'Разделы, заполненные в профиле, заменят соответствующие данные резюме.',
        confirmLabel: 'Заполнить', cancelLabel: 'Отмена' }))) { return; }
      if (this.#isDestroyed) { return; }
      if (profile.description) { field.value = profile.description; }
      for (const name of groupNames) {
        if (!profile[name]?.length) { continue; }
        const control = this.#form!.elements.namedItem(name) as HTMLInputElement;
        control.value = name === 'skills' ? profile.skills!.map((item) => item.name).join(', ') : JSON.stringify(profile[name]);
        control.dispatchEvent(new Event('change'));
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('Данные скопированы из профиля');
    });
    if (this.#id === null) { restoreCreationDraft(this.#draftPath, this.#form!); }
    this.#initialValues = JSON.stringify(this.#readFields());
    updateTextFields(this.#form!, RESUME_FIELD_LIMITS, getResumeFieldError);
    mountFormSteps(this.#form!, (field) => getResumeFieldError(field.name as keyof typeof RESUME_FIELD_LIMITS, field.value),
      this.#id === null ? { path: this.#draftPath, onSaved: () => { this.#initialValues = JSON.stringify(this.#readFields()); } } : undefined);
  }

  /**
   * Показывает, что редактировать нечего.
   */
  #renderNotFound(): void {
    this.#form = null;
    this.#container.innerHTML = template({
      error: { title: 'Резюме не найдено', text: 'Возможно, его удалили или ссылка устарела' },
    });
  }

  /**
   * Читает значения полей формы.
   * @returns Значения без пробелов по краям.
   */
  #readFields(): ResumeFields {
    const { title, description, experience, education } = this.#form!.elements as ResumeFormElements;

    return {
      ...readEditorDetails(this.#form!),
      title: title.value.trim(),
      description: description.value.trim(),
      experience: experience.value.trim(),
      education: education.value.trim(),
    };
  }

  /**
   * Адрес, куда вернуться после сохранения или отмены.
   * @param id Идентификатор резюме, если оно уже есть.
   * @returns Путь страницы.
   */
  #backPath(id: number | null): string {
    return id === null ? '/resumes' : `/resumes/${id}`;
  }

  /**
   * Уходит со страницы; если в форме есть изменения, сначала спрашивает подтверждение.
   */
  async #cancel(): Promise<void> {
    const isChanged = this.#form !== null && JSON.stringify(this.#readFields()) !== this.#initialValues;

    if (isChanged) {
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

    this.#router.navigate(this.#backPath(this.#id), { force: true });
  }

  /**
   * Сохраняет черновик перед заполнением профиля, не теряя текст при ошибке хранилища.
   */
  #completeProfile(): void {
    if (!this.#form || this.#isSubmitting) { return; }
    if (!saveCreationDraft(this.#draftPath, this.#form)) {
      showToast('Не удалось сохранить черновик. Скопируйте текст перед переходом к профилю', 'error');
      return;
    }
    this.#router.navigate('/profile/edit?next=' + (this.#copy === null ? '/resumes/new' : encodeURIComponent(this.#draftPath)), { force: true });
  }

  /**
   * Проверяет поля и сохраняет резюме.
   */
  async #submit(): Promise<void> {
    if (this.#isSubmitting || !this.#form) {
      return;
    }

    hideToast();

    if (!validateEditorDetails(this.#form)) { return; }
    const fields = this.#readFields();
    let firstInvalid: HTMLInputElement | HTMLTextAreaElement | null = null;
    for (const name of Object.keys(RESUME_FIELD_LIMITS) as (keyof typeof RESUME_FIELD_LIMITS)[]) {
      const field = (this.#form.elements as ResumeFormElements)[name];
      const error = getResumeFieldError(name, field.value);
      setFieldError(field, error);
      if (error) { firstInvalid ??= field; }
    }
    if (firstInvalid) { firstInvalid.focus(); return; }

    const button = this.#form.querySelector<HTMLButtonElement>('[type="submit"]')!;

    this.#isSubmitting = true;
    setLoading(button, true);

    let id = this.#id;

    try {
      if (id === null) {
        id = (await createResume(fields)).id;
      } else {
        await updateResume(id, fields);
      }
    } catch (error) {
      if (this.#isDestroyed) { return; }
      if (this.#id === null && await showMissingProfile(error, 'seeker', this.#abortController.signal, this.#form)) { return; }
      if (this.#isDestroyed) { return; }
      const action = this.#id === null ? 'создать' : 'сохранить';

      showToast(`Не удалось ${action} резюме. Попробуйте ещё раз`, 'error');
      return;
    } finally {
      this.#isSubmitting = false;
      setLoading(button, false);
    }

    if (!this.#isDestroyed) {
      if (this.#id === null) { clearCreationDraft(this.#draftPath); }
      this.#router.navigate(this.#backPath(id), { force: true });
    }
  }
}
