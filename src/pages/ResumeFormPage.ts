import { ApiError, createResume, getResume, updateResume, type ResumeFields } from '../api';
import { setFieldError, setLoading } from '../components/form';
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
    if (this.#id === null) {
      this.#renderForm({ title: '', description: '', experience: '', education: '' });
      return;
    }

    const { signal } = this.#abortController;

    this.#container.innerHTML = template({
      isLoading: true,
      heading: this.#heading,
      skeletonFields: Array.from({ length: SKELETON_FIELDS }),
    });

    if (!Number.isInteger(this.#id) || this.#id <= 0) {
      this.#renderNotFound();
      return;
    }

    try {
      const resume = await getResume(this.#id, { signal });

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
      resume,
      heading: this.#heading,
      submitLabel: this.#id === null ? 'Создать резюме' : 'Сохранить изменения',
    });

    this.#form = this.#container.querySelector<HTMLFormElement>('.edit-form');
    this.#initialValues = JSON.stringify(this.#readFields());
  }

  /**
   * Показывает, что редактировать нечего.
   */
  #renderNotFound(): void {
    this.#form = null;
    this.#container.innerHTML = template({
      error: { title: 'Резюме не найдено', text: 'Возможно, его удалили или ссылка устарела.' },
    });
  }

  /**
   * Читает значения полей формы.
   * @returns Значения без пробелов по краям.
   */
  #readFields(): ResumeFields {
    const { title, description, experience, education } = this.#form!.elements as ResumeFormElements;

    return {
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

    this.#router.navigate(this.#backPath(this.#id));
  }

  /**
   * Проверяет название и сохраняет резюме.
   */
  async #submit(): Promise<void> {
    if (this.#isSubmitting || !this.#form) {
      return;
    }

    hideToast();

    const fields = this.#readFields();
    const { title } = this.#form.elements as ResumeFormElements;

    if (!fields.title) {
      setFieldError(title, 'Введите название резюме.');
      title.focus();
      return;
    }

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
    } catch {
      const action = this.#id === null ? 'создать' : 'сохранить';

      showToast(`Не удалось ${action} резюме. Попробуйте ещё раз.`, 'error');
      return;
    } finally {
      this.#isSubmitting = false;
      setLoading(button, false);
    }

    if (!this.#isDestroyed) {
      this.#router.navigate(this.#backPath(id));
    }
  }
}
