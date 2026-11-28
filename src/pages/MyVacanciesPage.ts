import { ListFilters } from '../components/ListFilters';
import { clearCreationDraft, getCreationDrafts } from '../components/creation-draft';
import { getEmployerApplicants, deleteVacancy, getEmployerVacancies, type Vacancy } from '../api';
import { confirmAction } from '../components/Modal';
import { renderPagination } from '../components/pagination';
import { showToast } from '../components/toast';
import { formatSalary } from '@hirenoon/format';
import type { Page } from '../router';
import { currentRuntimeConfig, onRuntimeConfigChange, VACANCY_CREATION_DISABLED } from '../runtime-config';
import template from './MyVacanciesPage.hbs';
import resultsTemplate from './MyVacanciesResults.hbs';

const SKELETON_COUNT = 6;
const PAGE_SIZE = 5;

/**
 * Страница «Мои вакансии»: вакансии вошедшего работодателя с поиском по названию.
 */
export default class MyVacanciesPage implements Page {
  #abortController = new AbortController();
  #vacancies: Vacancy[] | null = null;
  #listFilters = new ListFilters();
  #query = '';
  #page = 1;
  #isDeleting = false;
  #search!: HTMLFormElement;
  #input!: HTMLInputElement;
  #content!: HTMLElement;
  #creationNotice!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает вакансии.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    container.innerHTML = template();

    this.#search = container.querySelector<HTMLFormElement>('.owner-list__search')!;
    this.#input = this.#search.querySelector<HTMLInputElement>('.owner-list__search-input')!;
    this.#content = container.querySelector<HTMLElement>('.owner-list__content')!;
    this.#creationNotice = container.querySelector<HTMLElement>('[data-vacancy-creation-notice]')!;
    onRuntimeConfigChange(() => this.#updateCreationAction(), this.#abortController.signal);
    this.#updateCreationAction();

    this.#search.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#setQuery(this.#input.value);
    });

    this.#content.addEventListener('click', (event) => {
      const target = event.target as Element;
      const page = target.closest<HTMLElement>('[data-page]')?.dataset.page;
      const actionElement = target.closest<HTMLElement>('[data-action]');

      if (page) {
        this.#page = Number(page);
        this.#renderList();
        window.scrollTo(0, 0);
      } else if (actionElement?.dataset.action === 'delete') {
        this.#confirmDelete(actionElement.dataset.draftPath ?? Number(actionElement.dataset.id));
      } else if (actionElement?.dataset.action === 'reset') {
        this.#listFilters.reset();
        this.#setQuery('');
      } else if (actionElement?.dataset.action === 'retry') {
        this.#load();
      }
    });

    this.#listFilters.mount(container, 'vacancies', () => {
      this.#page = 1;
      if (this.#vacancies) { this.#renderList(); }
    });
    this.#load();
  }

  /**
   * Вызывается при уходе со страницы: отменяет загрузку.
   */
  destroy(): void {
    this.#abortController.abort();
  }

  /**
   * Загружает вакансии вошедшего работодателя и название его компании.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;

    this.#vacancies = null;
    this.#content.innerHTML = resultsTemplate({ isLoading: true, skeletons: Array.from({ length: SKELETON_COUNT }) });

    try {
      this.#vacancies = await getEmployerVacancies({ signal });
    } catch (error) {
      if (!signal.aborted) {
        this.#content.innerHTML = resultsTemplate({ error: (error as Error).message });
      }

      return;
    }

    this.#renderList();
    try {
      const applications = await getEmployerApplicants({ signal });
      if (signal.aborted) { return; }
      const counts = new Map<number, { total: number; fresh: number }>();
      for (const item of applications) {
        if (!item.vacancy_id) { continue; }
        const count = counts.get(item.vacancy_id) ?? { total: 0, fresh: 0 };
        count.total++;
        if (item.status === 'created' || item.status === 'pending') { count.fresh++; }
        counts.set(item.vacancy_id, count);
      }
      this.#listFilters.setApplicationCounts(counts);
    } catch { /* Список документов доступен независимо от списка откликов. */ }
  }

  /**
   * Запоминает поисковый запрос и показывает первую страницу результатов.
   * @param query Текст запроса.
   */
  #setQuery(query: string): void {
    this.#query = query.trim();
    this.#page = 1;
    this.#input.value = this.#query;
    if (this.#vacancies) { this.#renderList(); }
  }

  /**
   * Рисует текущую страницу вакансий, подходящих под запрос, или пустое состояние.
   */
  #renderList(): void {
    const drafts = getCreationDrafts('/vacancies/new', 'Вакансия без названия');
    const records = [...drafts, ...(this.#vacancies ?? [])];
    const query = this.#query.toLowerCase();
    const found = this.#listFilters.apply(records.filter(({ title }) => title.toLowerCase().includes(query)), true);
    const pageCount = Math.ceil(found.length / PAGE_SIZE);

    // После удаления последней вакансии на странице возвращаемся на предыдущую.
    this.#page = Math.min(this.#page, Math.max(pageCount, 1));

    this.#content.innerHTML = resultsTemplate({
      vacancies: found
        .slice((this.#page - 1) * PAGE_SIZE, this.#page * PAGE_SIZE)
        .map((item) => {
          if ('draftPath' in item) { return { ...item, href: item.draftPath }; }
          const { id, title, description, salary_from: from, salary_to: to, currency } = item;
          const categories = item.categories ?? [];
          const hiddenCategoryCount = categories.length > 3 ? categories.length - 2 : 0;
          return {
            id, title, description,
            href: `/vacancies/${id}`,
            categories: hiddenCategoryCount ? categories.slice(0, 2) : categories,
            hiddenCategoryCount,
            salary: formatSalary(from, to, currency),
            hasSalary: (from !== null && from !== undefined) || (to !== null && to !== undefined),
          };
        }),
      canCreate: !drafts.some(({ draftPath }) => draftPath === '/vacancies/new'),
      hasQuery: Boolean(query) || this.#listFilters.active,
      pagination: renderPagination(this.#page, pageCount),
    });
    this.#updateCreationAction();
  }

  /** Синхронизирует доступность создания без перерисовки списка и фильтров. */
  #updateCreationAction(): void {
    const enabled = currentRuntimeConfig().vacancyCreationEnabled;
    const link = this.#content.querySelector<HTMLElement>('[data-vacancy-create]');
    if (link) { link.hidden = !enabled; }
    this.#creationNotice.hidden = enabled;
    this.#creationNotice.textContent = enabled ? '' : VACANCY_CREATION_DISABLED;
  }

  /**
   * Спрашивает подтверждение и удаляет вакансию из списка.
   * @param idOrDraftPath Идентификатор опубликованной записи или путь к черновику.
   */
  async #confirmDelete(idOrDraftPath: number | string): Promise<void> {
    if (this.#isDeleting) {
      return;
    }

    const isConfirmed = await confirmAction({
      title: typeof idOrDraftPath === 'string' ? 'Удалить черновик?' : 'Удалить вакансию?',
      text: 'Восстановить её после удаления не получится.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
    });

    if (!isConfirmed || this.#abortController.signal.aborted) {
      return;
    }

    if (typeof idOrDraftPath === 'string') {
      const deleted = clearCreationDraft(idOrDraftPath);
      showToast(deleted ? 'Черновик удалён' : 'Не удалось удалить черновик', deleted ? 'success' : 'error');
      if (deleted) { this.#renderList(); }
      return;
    }

    this.#isDeleting = true;

    try {
      await deleteVacancy(idOrDraftPath);
    } catch (error) {
      showToast((error as Error).message, 'error');
      return;
    } finally {
      this.#isDeleting = false;
    }

    showToast('Вакансия удалена');

    if (!this.#abortController.signal.aborted && this.#vacancies) {
      this.#vacancies = this.#vacancies.filter((vacancy) => vacancy.id !== idOrDraftPath);
      this.#renderList();
    }
  }
}
