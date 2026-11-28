import { mountEditorDetails, readEditorDetails, validateEditorDetails } from '../components/editor-details';
import { mountCardImages } from '../components/profile-images';
import { mountFormSteps } from '../components/form-steps';
import {
  getVacancyTitleError,
  getVacancyDescriptionError,
  MAX_VACANCY_TITLE_LENGTH,
  MAX_VACANCY_DESCRIPTION_LENGTH,
} from '@hirenoon/validation';
import { saveCreationDraft, restoreCreationDraft, clearCreationDraft } from '../components/creation-draft';
import { getRequiredProfile, showMissingProfile } from '../profile-required';
import { getVacancyCategories, ApiError, createVacancy, getVacancy, isFeatureDisabledError, updateVacancy, type Currency, type VacancyFields } from '../api';
import { setFieldError, setLoading, updateTextFields } from '../components/form';
import { confirmAction } from '../components/Modal';
import { hideToast, showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getCurrentUser } from '../session';
import { currentRuntimeConfig, onRuntimeConfigChange, reportDisabledFeature, VACANCY_CREATION_DISABLED } from '../runtime-config';
import template from './VacancyFormPage.hbs';

const SKELETON_FIELDS = 3;
const MAX_SALARY = 9_999_999_999;
const TEXT_FIELD_LIMITS = { title: MAX_VACANCY_TITLE_LENGTH, description: MAX_VACANCY_DESCRIPTION_LENGTH };

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
    return { error: 'Введите сумму целым числом' };
  }

  const salary = Number(normalized);

  return salary > MAX_SALARY ? { error: 'Слишком большая сумма' } : salary;
}

/**
 * Страница создания вакансии (`/vacancies/new`) и её редактирования (`/vacancies/:id/edit`).
 */
export default class VacancyFormPage implements Page {
  #router: Router;
  #company = '';
  #logo?: string | null;
  /** Идентификатор редактируемой вакансии; `null` при создании. */
  #id: number | null;
  #abortController = new AbortController();
  #container!: HTMLElement;
  #form: HTMLFormElement | null = null;
  /** Значения полей при открытии формы — чтобы понять, есть ли несохранённые изменения. */
  #initialValues = '';
  #isSubmitting = false;
  #isPublishStep = false;
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
      const field = event.target as HTMLInputElement | HTMLTextAreaElement;
      setFieldError(field, '');
      if (this.#form) { this.#updateTextFields(field); }
    }, { signal });

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

    onRuntimeConfigChange(() => {
      this.#updatePublishing();
      this.#updateCategoryLimit();
    }, signal);
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
    return this.#form !== null && this.#snapshot() !== this.#initialValues;
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
        const profile = await getRequiredProfile('employer', this.#abortController.signal);
        if (this.#abortController.signal.aborted) { return; }
        if (!profile) {
          this.#container.innerHTML = template({ profileRequired: true, profilePath: '/profile/edit?next=/vacancies/new' });
          return;
        }
        if ('company_name' in profile) { this.#company = profile.company_name; this.#logo = profile.logo_url; }
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

      this.#company = vacancy.company_name;
      this.#logo = vacancy.logo_url;
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
      vacancy, company: this.#company, logo: this.#logo,
      heading: this.#heading,
      isEdit: this.#id !== null,
      submitLabel: this.#id === null ? 'Опубликовать вакансию' : 'Сохранить',
      salaryFrom: formatOptional(vacancy.salary_from),
      salaryTo: formatOptional(vacancy.salary_to),
      currencies: CURRENCIES.map((currency) => ({ ...currency, selected: currency.code === vacancy.currency })),
    });

    this.#form = this.#container.querySelector<HTMLFormElement>('.edit-form');
    mountEditorDetails(this.#form!, vacancy);
    if (this.#id === null) { restoreCreationDraft('/vacancies/new', this.#form!); }
    void this.#loadCategories(vacancy);
    this.#initialValues = this.#snapshot();
    this.#updateTextFields();
    mountCardImages(this.#form!);
    mountFormSteps(this.#form!, (field) => this.#fieldError(field),
      this.#id === null ? { path: '/vacancies/new', onSaved: () => { this.#initialValues = this.#snapshot(); } } : undefined,
      (final) => {
        this.#isPublishStep = final;
        this.#updatePublishing();
      });
  }

  /** Меняет доступность публикации на последнем шаге, сохраняя введённые поля. */
  #updatePublishing(): void {
    if (!this.#form) { return; }
    const blocked = this.#id === null && !currentRuntimeConfig().vacancyCreationEnabled;
    const button = this.#form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    button.disabled = this.#isSubmitting || (blocked && this.#isPublishStep);
    const notice = this.#form.querySelector<HTMLElement>('[data-vacancy-creation-notice]');
    if (notice) {
      notice.hidden = !blocked;
      notice.textContent = blocked ? VACANCY_CREATION_DISABLED : '';
    }
  }

  /** Обновляет подсказку и доступность выбора без изменения сохранённых категорий. */
  #updateCategoryLimit(): void {
    if (!this.#form) { return; }
    const select = this.#form.querySelector<HTMLSelectElement>('[data-category-select]')!;
    if (!select.options.length) { return; }
    const hidden = this.#form.elements.namedItem('category_ids') as HTMLInputElement;
    const hint = this.#form.querySelector<HTMLElement>('[data-category-hint]')!;
    const limit = currentRuntimeConfig().maxVacancyCategories;
    const selected = select.selectedOptions.length;
    const exceeds = selected > limit;
    for (const option of select.options) { option.disabled = selected >= limit && !option.selected; }
    select.setAttribute('aria-invalid', String(exceeds && !hidden.disabled));
    if (exceeds) {
      hint.textContent = hidden.disabled
        ? `Текущий лимит — ${limit}. Сохранённые направления можно оставить.`
        : `Выбрано ${selected}. Сократите число направлений до ${limit}.`;
    } else {
      hint.textContent = `Выбрано ${selected} из ${limit}.`;
    }
  }

  /**
   * Загружает названия и ID тегов, сохраняя выбор при редактировании или восстановлении черновика.
   * @param vacancy Исходная вакансия.
   */
  async #loadCategories(vacancy: VacancyFields): Promise<void> {
    const form = this.#form!;
    const select = form.querySelector<HTMLSelectElement>('[data-category-select]')!;
    const hidden = form.elements.namedItem('category_ids') as HTMLInputElement;
    const hint = form.querySelector<HTMLElement>('[data-category-hint]')!;
    try {
      const draft: number[] | null = hidden.value ? JSON.parse(hidden.value) : null;
      if (Array.isArray(draft)) { hidden.disabled = false; }
      const categories = await getVacancyCategories(this.#abortController.signal);
      if (this.#isDestroyed || form !== this.#form) { return; }
      const original = 'categories' in vacancy && Array.isArray(vacancy.categories) ? vacancy.categories : [];
      const originalIds = new Set(categories.filter(({ name }) => original.includes(name)).map(({ id }) => id));
      for (const { id, name } of categories) { select.add(new Option(name, String(id), false, Array.isArray(draft) ? draft.includes(id) : original.includes(name))); }
      select.disabled = !categories.length;
      if (categories.length) { this.#updateCategoryLimit(); } else { hint.textContent = 'Справочник пока пуст'; }
      select.addEventListener('change', () => {
        const ids = [...select.selectedOptions].map((option) => Number(option.value));
        hidden.value = JSON.stringify(ids);
        hidden.disabled = this.#id !== null && ids.length === originalIds.size && ids.every((id) => originalIds.has(id));
        this.#updateCategoryLimit();
      });
    } catch {
      if (!this.#isDestroyed) { hint.textContent = 'Не удалось загрузить направления'; }
    }
  }

  /**
   * Обновляет счётчики и ошибки длины, сохраняя весь введённый текст.
   * @param changed Изменённое поле; без него обновляется вся форма.
   */
  #updateTextFields(changed?: Element): void {
    updateTextFields(this.#form!, TEXT_FIELD_LIMITS, (name, value) => name === 'title' ? getVacancyTitleError(value) : getVacancyDescriptionError(value), changed);
  }

  /**
   * Показывает, что редактировать нечего.
   */
  #renderNotFound(): void {
    this.#form = null;
    this.#container.innerHTML = template({
      error: { title: 'Вакансия не найдена', text: 'Возможно, её удалили или ссылка устарела' },
    });
  }

  /**
   * Собирает текущие значения полей в строку, чтобы сравнить их с исходными.
   * @returns Значения полей без пробелов по краям.
   */
  #snapshot(): string {
    const { title, description, salaryFrom, salaryTo, currency } = this.#form!.elements as VacancyFormElements;

    return JSON.stringify([title, description, salaryFrom, salaryTo, currency].map((field) => field.value.trim()).concat(JSON.stringify(readEditorDetails(this.#form!))));
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

    this.#router.navigate(this.#backPath(this.#id), { force: true });
  }

  /**
   * Сохраняет черновик перед заполнением профиля, не теряя текст при ошибке хранилища.
   */
  #completeProfile(): void {
    if (!this.#form || this.#isSubmitting) { return; }
    if (!saveCreationDraft('/vacancies/new', this.#form)) {
      showToast('Не удалось сохранить черновик. Скопируйте текст перед переходом к профилю', 'error');
      return;
    }
    this.#router.navigate('/profile/edit?next=/vacancies/new', { force: true });
  }

  /**
   * Проверяет поле и границы диапазона зарплаты.
   * @param field Поле текущего шага.
   * @returns Ошибка или пустая строка.
   */
  #fieldError(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    if (field.name === 'title') { return getVacancyTitleError(field.value); }
    if (field.name === 'description') { return getVacancyDescriptionError(field.value); }
    if (field.name !== 'salaryFrom' && field.name !== 'salaryTo') { return ''; }
    const value = parseSalary(field.value);
    if (value && typeof value === 'object') { return value.error; }
    const from = parseSalary((this.#form!.elements as VacancyFormElements).salaryFrom.value);
    return field.name === 'salaryTo' && typeof from === 'number' && typeof value === 'number' && value < from
      ? 'Зарплата до не может быть меньше зарплаты от' : '';
  }

  /**
   * Проверяет поля и показывает ошибки под ними.
   * @returns Поля вакансии или `null`, если есть ошибки.
   */
  #validate(): VacancyFields | null {
    const { title, description, salaryFrom, salaryTo, currency } = this.#form!.elements as VacancyFormElements;
    const from = parseSalary(salaryFrom.value);
    const to = parseSalary(salaryTo.value);
    const errors = new Map<HTMLInputElement | HTMLTextAreaElement, string>();

    for (const field of [title, description, salaryFrom, salaryTo]) {
      const error = this.#fieldError(field);
      if (error) { errors.set(field, error); }
    }

    for (const field of [title, description, salaryFrom, salaryTo]) {
      setFieldError(field, errors.get(field) ?? '');
    }

    if (errors.size > 0) {
      errors.keys().next().value?.focus();
      return null;
    }

    if (!validateEditorDetails(this.#form!)) { return null; }
    const details = readEditorDetails(this.#form!);
    const limit = currentRuntimeConfig().maxVacancyCategories;
    if (Array.isArray(details.category_ids) && details.category_ids.length > limit) {
      showToast(`Выберите не больше ${limit} направлений на первом шаге`, 'error');
      return null;
    }
    return {
      ...details,
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
    if (this.#id === null && !currentRuntimeConfig().vacancyCreationEnabled) {
      showToast(VACANCY_CREATION_DISABLED, 'error');
      return;
    }

    const fields = this.#validate();

    if (!fields) {
      return;
    }

    const button = this.#form.querySelector<HTMLButtonElement>('[type="submit"]')!;

    this.#isSubmitting = true;
    setLoading(button, true);
    this.#updatePublishing();

    let id = this.#id;

    try {
      if (id === null) {
        id = (await createVacancy(fields)).id;
      } else {
        await updateVacancy(id, fields);
      }
    } catch (error) {
      if (this.#isDestroyed) { return; }
      if (this.#id === null && isFeatureDisabledError(error)) {
        reportDisabledFeature('vacancyCreationEnabled');
        showToast(VACANCY_CREATION_DISABLED, 'error');
        return;
      }
      if (this.#id === null && await showMissingProfile(error, 'employer', this.#abortController.signal, this.#form)) { return; }
      if (this.#isDestroyed) { return; }
      showToast(this.#getSubmitError(error), 'error');
      return;
    } finally {
      this.#isSubmitting = false;
      setLoading(button, false);
      if (!this.#isDestroyed) { this.#updatePublishing(); }
    }

    if (!this.#isDestroyed) {
      if (this.#id === null) { clearCreationDraft('/vacancies/new'); }
      this.#router.navigate(this.#backPath(id), { force: true });
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
      return 'Создавать вакансии может только работодатель с заполненным профилем компании';
    }

    const action = this.#id === null ? 'создать' : 'сохранить';

    return `Не удалось ${action} вакансию. Попробуйте ещё раз`;
  }
}
