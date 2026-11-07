import { hasRequiredProfile } from '../profile-required';
import { ApiError, createVacancy, getVacancy, updateVacancy, type Currency, type VacancyFields } from '../api';
import { setFieldError, setLoading } from '../components/form';
import { confirmAction } from '../components/Modal';
import { hideToast, showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getCurrentUser } from '../session';
import template from './VacancyFormPage.hbs';

const SKELETON_FIELDS = 3;
const MAX_SALARY = 9_999_999_999;

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: 'RUB', label: 'RUB ₽' },
  { code: 'USD', label: 'USD $' },
  { code: 'EUR', label: 'EUR €' },
];

// Сумма с пробелами между разрядами.
const salaryFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/**
 * Поля формы вакансии.
 */
interface VacancyFormElements extends HTMLFormControlsCollection {
  /** Название. */
  title: HTMLInputElement;
  /** Описание. */
  description: HTMLTextAreaElement;
  /** Зарплата от. */
  salaryFrom: HTMLInputElement;
  /** Зарплата до. */
  salaryTo: HTMLInputElement;
  /** Валюта. */
  currency: HTMLSelectElement;
}

/**
 * Разбирает сумму из поля зарплаты.
 * @param value Текст из поля; пробелы между разрядами допускаются.
 * @returns Сумма, `null` для пустого поля или текст ошибки.
 */
function parseSalary(value: string): number | null | { error: string } {
  const normalized = value.replace(/\s/g, '');

  if (!normalized) {
    return null;
  }

  // Копейки в зарплате не указывают, а в карточках сумма всё равно округляется до рублей.
  if (!/^\d+$/.test(normalized)) {
    return { error: 'Введите сумму целым числом.' };
  }

  const salary = Number(normalized);

  return salary > MAX_SALARY ? { error: 'Слишком большая сумма.' } : salary;
}

/**
 * Страница создания вакансии (`/vacancies/new`) и её редактирования (`/vacancies/:id/edit`).
 */
export default class VacancyFormPage implements Page {
  #router: Router;
  /** Идентификатор редактируемой вакансии; `null` при создании. */
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
   * Рисует форму; при редактировании сначала загружает вакансию.
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

    // Правильную сумму после ввода показываем с пробелами между разрядами.
    container.addEventListener(
      'focusout',
      (event) => {
        const input = event.target as HTMLInputElement;

        if (input.name === 'salaryFrom' || input.name === 'salaryTo') {
          const salary = parseSalary(input.value);

          if (typeof salary === 'number') {
            input.value = salaryFormat.format(salary);
          }
        }
      },
      { signal },
    );

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
    return this.#id === null ? 'Создание вакансии' : 'Редактирование вакансии';
  }

  /**
   * Показывает пустую форму или загружает вакансию для редактирования.
   */
  async #load(): Promise<void> {
    if (this.#id === null) {
      this.#form = null;
      this.#container.innerHTML = template({ isLoading: true, heading: this.#heading });
      try {
        if (!(await hasRequiredProfile('employer', this.#abortController.signal))) {
          this.#container.innerHTML = template({ profileRequired: true, profilePath: '/profile/edit?next=/vacancies/new' });
          return;
        }
      } catch (error) {
        if (!this.#abortController.signal.aborted) {
          this.#container.innerHTML = template({ error: { title: 'Не удалось проверить профиль', text: (error as Error).message, canRetry: true } });
        }
        return;
      }
      if (this.#abortController.signal.aborted) { return; }
      this.#renderForm({ title: '', description: '', salary_from: null, salary_to: null, currency: 'RUB' });
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
      const vacancy = await getVacancy(this.#id, { signal });

      // Чужую вакансию бэкенд всё равно не даст сохранить, поэтому для формы она как будто не существует.
      if (vacancy.employer_id !== getCurrentUser()?.id) {
        this.#renderNotFound();
        return;
      }

      this.#renderForm(vacancy);
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        this.#renderNotFound();
      } else {
        this.#container.innerHTML = template({
          error: { title: 'Не удалось загрузить вакансию', text: (error as Error).message, canRetry: true },
        });
      }
    }
  }

  /**
   * Рисует форму с заполненными полями.
   * @param vacancy Значения полей.
   */
  #renderForm(vacancy: VacancyFields): void {
    const formatOptional = (salary: number | null): string => (salary === null ? '' : salaryFormat.format(salary));

    this.#container.innerHTML = template({
      vacancy,
      heading: this.#heading,
      isEdit: this.#id !== null,
      submitLabel: this.#id === null ? 'Создать вакансию' : 'Сохранить',
      salaryFrom: formatOptional(vacancy.salary_from),
      salaryTo: formatOptional(vacancy.salary_to),
      currencies: CURRENCIES.map((currency) => ({ ...currency, selected: currency.code === vacancy.currency })),
    });

    this.#form = this.#container.querySelector<HTMLFormElement>('.edit-form');
    this.#initialValues = this.#snapshot();
  }

  /**
   * Показывает, что редактировать нечего.
   */
  #renderNotFound(): void {
    this.#form = null;
    this.#container.innerHTML = template({
      error: { title: 'Вакансия не найдена', text: 'Возможно, её удалили или ссылка устарела.' },
    });
  }

  /**
   * Собирает текущие значения полей в строку, чтобы сравнить их с исходными.
   * @returns Значения полей без пробелов по краям.
   */
  #snapshot(): string {
    const { title, description, salaryFrom, salaryTo, currency } = this.#form!.elements as VacancyFormElements;

    return JSON.stringify([title, description, salaryFrom, salaryTo, currency].map((field) => field.value.trim()));
  }

  /**
   * Адрес, куда вернуться после сохранения или отмены.
   * @param id Идентификатор вакансии, если она уже есть.
   * @returns Путь страницы.
   */
  #backPath(id: number | null): string {
    return id === null ? '/my/vacancies' : `/vacancies/${id}`;
  }

  /**
   * Уходит со страницы; если в форме есть изменения, сначала спрашивает подтверждение.
   */
  async #cancel(): Promise<void> {
    if (this.#form !== null && this.#snapshot() !== this.#initialValues) {
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
   * Проверяет поля и показывает ошибки под ними.
   * @returns Поля вакансии или `null`, если есть ошибки.
   */
  #validate(): VacancyFields | null {
    const { title, description, salaryFrom, salaryTo, currency } = this.#form!.elements as VacancyFormElements;
    const from = parseSalary(salaryFrom.value);
    const to = parseSalary(salaryTo.value);
    const errors = new Map<HTMLInputElement, string>();

    if (!title.value.trim()) {
      errors.set(title, 'Введите название вакансии.');
    }

    if (typeof from === 'object' && from !== null) {
      errors.set(salaryFrom, from.error);
    }

    if (typeof to === 'object' && to !== null) {
      errors.set(salaryTo, to.error);
    } else if (typeof from === 'number' && typeof to === 'number' && to < from) {
      errors.set(salaryTo, 'Зарплата до не может быть меньше зарплаты от.');
    }

    for (const field of [title, salaryFrom, salaryTo]) {
      setFieldError(field, errors.get(field) ?? '');
    }

    if (errors.size > 0) {
      errors.keys().next().value?.focus();
      return null;
    }

    return {
      title: title.value.trim(),
      description: description.value.trim(),
      salary_from: from as number | null,
      salary_to: to as number | null,
      currency: currency.value as Currency,
    };
  }

  /**
   * Проверяет поля и сохраняет вакансию.
   */
  async #submit(): Promise<void> {
    if (this.#isSubmitting || !this.#form) {
      return;
    }

    hideToast();

    const fields = this.#validate();

    if (!fields) {
      return;
    }

    const button = this.#form.querySelector<HTMLButtonElement>('[type="submit"]')!;

    this.#isSubmitting = true;
    setLoading(button, true);

    let id = this.#id;

    try {
      if (id === null) {
        id = (await createVacancy(fields)).id;
      } else {
        await updateVacancy(id, fields);
      }
    } catch (error) {
      showToast(this.#getSubmitError(error), 'error');
      return;
    } finally {
      this.#isSubmitting = false;
      setLoading(button, false);
    }

    if (!this.#isDestroyed) {
      this.#router.navigate(this.#backPath(id));
    }
  }

  /**
   * Подбирает текст ошибки сохранения.
   * @param error Ошибка запроса.
   * @returns Текст для уведомления.
   */
  #getSubmitError(error: unknown): string {
    // Без заполненного профиля компании бэкенд не даёт создавать вакансии.
    if (this.#id === null && error instanceof ApiError && error.status === 403) {
      return 'Создавать вакансии может только работодатель с заполненным профилем компании.';
    }

    const action = this.#id === null ? 'создать' : 'сохранить';

    return `Не удалось ${action} вакансию. Попробуйте ещё раз.`;
  }
}
