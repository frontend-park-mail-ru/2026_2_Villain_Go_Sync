import { conditions, workLabel } from '../components/work-options';
import { isFavorite, toggleFavorite } from '../components/favorites';
import { getCurrentUser } from '../session';
import { ListFilters } from '../components/ListFilters';
import { mountCardImages } from '../components/profile-images';
import { getVacancies, getVacancyCategories, type Vacancy } from '../api';
import { renderPagination } from '../components/pagination';
import { formatPublished, formatSalary } from '@hirenoon/format';
import type { Page } from '../router';
import template from './VacanciesPage.hbs';
import categoryFiltersTemplate from './VacancyCategoryFilters.hbs';
import resultsTemplate from './VacanciesResults.hbs';

const SKELETON_COUNT = 6;
const PAGE_SIZE = 6;

/**
 * Главная страница — лента вакансий.
 */
export default class VacanciesPage implements Page {
  #abortController = new AbortController();
  #vacancies: Vacancy[] | null = null;
  #listFilters = new ListFilters();
  #query = '';
  #employerId = Number(new URLSearchParams(location.search).get('employer_id'));
  #selectedCategory: string | null = null;
  #page = 1;
  #input!: HTMLInputElement;
  #filters!: HTMLElement;
  #results!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает вакансии.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    const employerId = this.#companyFilter;
    container.innerHTML = template({ employerId });

    this.#input = container.querySelector<HTMLInputElement>('#vacancies-query')!;
    this.#filters = container.querySelector<HTMLElement>('.vacancies__filters')!;
    this.#results = container.querySelector<HTMLElement>('.vacancies__results')!;

    container.querySelector('.vacancies__search')!.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#query = this.#input.value.trim();
      this.#input.value = this.#query;
      this.#refreshResults();
    });

    this.#filters.addEventListener('click', (event) => {
      const target = event.target as Element;
      const category = target.closest<HTMLButtonElement>('[data-category]')?.dataset.category?.toLowerCase();
      if (category) {
        this.#selectCategory(this.#selectedCategory === category ? null : category);
      } else if (target.closest('[data-retry-categories]')) {
        this.#loadCategories();
      }
    });

    this.#results.addEventListener('click', (event) => {
      const favorite = (event.target as Element).closest<HTMLButtonElement>('[data-favorite]');
      if (favorite) {
        const vacancy = this.#vacancies?.find((item) => item.id === Number(favorite.dataset.favorite));
        if (vacancy) { toggleFavorite(vacancy, favorite); }
        return;
      }
      const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
      const page = (event.target as Element).closest<HTMLElement>('[data-page]')?.dataset.page;

      if (page) {
        this.#page = Number(page);
        this.#renderList(this.#vacancies ?? []);
        window.scrollTo(0, 0);
        return;
      }

      if (action === 'reset') {
        this.#listFilters.reset();
        this.#query = '';
        this.#input.value = '';
        this.#selectCategory(null);
      } else if (action === 'retry') {
        this.#load();
      }
    });

    this.#listFilters.mount(container, 'catalog', () => this.#refreshResults());
    this.#load();
    this.#loadCategories();
  }

  /**
   * Вызывается при уходе со страницы: отменяет загрузку.
   */
  destroy(): void {
    this.#abortController.abort();
  }

  /**
   * @returns Идентификатор компании из ссылки профиля, если он корректен.
   */
  get #companyFilter(): number | undefined {
    return Number.isSafeInteger(this.#employerId) && this.#employerId > 0 ? this.#employerId : undefined;
  }

  /**
   * Загружает вакансии и показывает скелетон, список или ошибку.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;

    this.#vacancies = null;
    this.#results.innerHTML = resultsTemplate({
      isLoading: true,
      skeletons: Array.from({ length: SKELETON_COUNT }),
    });

    try {
      this.#vacancies = await getVacancies({ signal, employerId: this.#companyFilter });
    } catch (error) {
      if (!signal.aborted) {
        this.#results.innerHTML = resultsTemplate({ error: (error as Error).message });
      }

      return;
    }

    this.#renderList(this.#vacancies);
  }

  /**
   * Загружает справочник независимо от списка вакансий.
   */
  async #loadCategories(): Promise<void> {
    const { signal } = this.#abortController;
    this.#filters.replaceChildren();

    try {
      const categories = await getVacancyCategories(signal);
      if (!signal.aborted && categories.length) {
        this.#filters.innerHTML = categoryFiltersTemplate({ categories });
      }
    } catch {
      if (!signal.aborted) {
        this.#filters.innerHTML = categoryFiltersTemplate({ error: true });
      }
    }
  }

  /**
   * Обновляет состояние кнопок категорий и выдачу.
   * @param category Название выбранной категории в нижнем регистре или null для сброса.
   */
  #selectCategory(category: string | null): void {
    this.#selectedCategory = category;
    for (const chip of this.#filters.querySelectorAll<HTMLButtonElement>('[data-category]')) {
      const selected = chip.dataset.category?.toLowerCase() === category;
      chip.classList.toggle('chip_selected', selected);
      chip.setAttribute('aria-pressed', String(selected));
    }
    this.#refreshResults();
  }

  /**
   * Показывает первую страницу выдачи после изменения запроса или фильтров.
   */
  #refreshResults(): void {
    this.#page = 1;
    if (this.#vacancies) {
      this.#renderList(this.#vacancies);
    }
  }

  /**
   * Рисует текущую страницу вакансий, подходящих под запрос, или пустое состояние.
   * @param allVacancies Все загруженные вакансии.
   */
  #renderList(allVacancies: Vacancy[]): void {
    const query = this.#query.toLowerCase();
    const selectedCategory = this.#selectedCategory;
    const found = this.#listFilters.apply(allVacancies.filter(({ title, description, company_name, categories, city }) =>
      (selectedCategory === null || categories?.some((category) => category.toLowerCase() === selectedCategory)) &&
      `${title} ${description} ${company_name || ''} ${categories?.join(' ') ?? ''} ${city ?? ''}`.toLowerCase().includes(query),
    ));
    const pageCount = Math.ceil(found.length / PAGE_SIZE);
    const vacancies = found
      .slice((this.#page - 1) * PAGE_SIZE, this.#page * PAGE_SIZE)
      .map((vacancy) => {
        const { id, title, salary_from: from, salary_to: to, currency, created_at: createdAt, company_name: company, logo_url: logoUrl } = vacancy;
        return {
        conditions: conditions(vacancy), tags: vacancy.categories, level: workLabel('experience_level', vacancy.experience_level), deadline: vacancy.apply_until,
        favorite: isFavorite(id),
        company,
        logoUrl,
        id,
        title,
        salary: formatSalary(from, to, currency),
        hasSalary: (from !== null && from !== undefined) || (to !== null && to !== undefined),
        published: formatPublished(createdAt),
        };
      });

    this.#results.innerHTML = resultsTemplate({
      vacancies,
      showFavorites: getCurrentUser()?.role !== 'employer',
      hasQuery: Boolean(query) || selectedCategory !== null || this.#listFilters.active,
      pagination: renderPagination(this.#page, pageCount),
    });
    mountCardImages(this.#results);
  }
}
