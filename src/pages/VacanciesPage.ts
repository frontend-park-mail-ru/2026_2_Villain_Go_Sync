import { getVacancies, type Vacancy } from '../api';
import { formatPublished, formatSalary } from '../format';
import type { Page } from '../router';
import template from './VacanciesPage.hbs';
import resultsTemplate from './VacanciesResults.hbs';

const FILTERS = ['Go', 'C++', 'Python', 'DevOps', 'PostgreSQL', 'Backend'];
const SKELETON_COUNT = 4;

/**
 * Главная страница — лента вакансий.
 */
export default class VacanciesPage implements Page {
  #abortController = new AbortController();
  #vacancies: Vacancy[] | null = null;
  #query = '';
  #input!: HTMLInputElement;
  #filters!: HTMLElement;
  #results!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает вакансии.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    container.innerHTML = template({ filters: FILTERS });

    this.#input = container.querySelector<HTMLInputElement>('#vacancies-query')!;
    this.#filters = container.querySelector<HTMLElement>('.vacancies__filters')!;
    this.#results = container.querySelector<HTMLElement>('.vacancies__results')!;

    container.querySelector('.vacancies__search')!.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#search(this.#input.value);
    });

    this.#filters.addEventListener('click', (event) => {
      const chip = (event.target as Element).closest('.chip');

      if (chip) {
        // Повторный клик по выбранному фильтру снимает его.
        this.#search(chip.classList.contains('chip_selected') ? '' : (chip.textContent ?? ''));
      }
    });

    this.#results.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;

      if (action === 'reset') {
        this.#search('');
      } else if (action === 'retry') {
        this.#load();
      }
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
      this.#vacancies = await getVacancies({ signal });
    } catch (error) {
      if (!signal.aborted) {
        this.#results.innerHTML = resultsTemplate({ error: (error as Error).message });
      }

      return;
    }

    this.#renderList(this.#vacancies);
  }

  /**
   * Применяет поисковый запрос: бэкенд искать не умеет, поэтому фильтруется уже загруженный список.
   * @param query Текст запроса или название фильтра; пустая строка сбрасывает поиск.
   */
  #search(query: string): void {
    this.#query = query.trim();
    this.#input.value = this.#query;

    for (const chip of this.#filters.querySelectorAll('.chip')) {
      chip.classList.toggle('chip_selected', chip.textContent?.toLowerCase() === this.#query.toLowerCase());
    }

    if (this.#vacancies) {
      this.#renderList(this.#vacancies);
    }
  }

  /**
   * Рисует вакансии, подходящие под текущий запрос, или пустое состояние.
   * @param allVacancies Все загруженные вакансии.
   */
  #renderList(allVacancies: Vacancy[]): void {
    const query = this.#query.toLowerCase();
    const vacancies = allVacancies
      .filter(({ title, description }) => `${title} ${description}`.toLowerCase().includes(query))
      .map(({ title, description, salary_from: from, salary_to: to, created_at: createdAt }) => ({
        title,
        description,
        salary: formatSalary(from, to),
        published: formatPublished(createdAt),
      }));

    this.#results.innerHTML = resultsTemplate({ vacancies, hasQuery: Boolean(query) });
  }
}
