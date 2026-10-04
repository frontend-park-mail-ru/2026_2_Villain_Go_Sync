import { getVacancies } from '../api.js';
import { formatPublished, formatSalary } from '../format.js';
import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./VacanciesPage.hbs', import.meta.url));
const resultsTemplate = await loadTemplate(new URL('./VacanciesResults.hbs', import.meta.url));

const FILTERS = ['Go', 'C++', 'Python', 'DevOps', 'PostgreSQL', 'Backend'];
const SKELETON_COUNT = 4;

/**
 * Главная страница — лента вакансий.
 */
export default class VacanciesPage {
  #abortController = new AbortController();

  /** @type {import('../api.js').Vacancy[] | null} */
  #vacancies = null;

  #query = '';

  /** @type {HTMLInputElement} */
  #input;

  /** @type {HTMLElement} */
  #filters;

  /** @type {HTMLElement} */
  #results;

  /**
   * Рисует страницу в контейнер и загружает вакансии.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template({ filters: FILTERS });

    this.#input = container.querySelector('#vacancies-query');
    this.#filters = container.querySelector('.vacancies__filters');
    this.#results = container.querySelector('.vacancies__results');

    container.querySelector('.vacancies__search').addEventListener('submit', (event) => {
      event.preventDefault();
      this.#search(this.#input.value);
    });

    this.#filters.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');

      if (chip) {
        // Повторный клик по выбранному фильтру снимает его.
        this.#search(chip.classList.contains('chip_selected') ? '' : chip.textContent);
      }
    });

    this.#results.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;

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
  destroy() {
    this.#abortController.abort();
  }

  /**
   * Загружает вакансии и показывает скелетон, список или ошибку.
   */
  async #load() {
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
        this.#results.innerHTML = resultsTemplate({ error: error.message });
      }

      return;
    }

    this.#renderList();
  }

  /**
   * Применяет поисковый запрос: бэкенд искать не умеет, поэтому фильтруется уже загруженный список.
   * @param {string} query Текст запроса или название фильтра; пустая строка сбрасывает поиск.
   */
  #search(query) {
    this.#query = query.trim();
    this.#input.value = this.#query;

    for (const chip of this.#filters.querySelectorAll('.chip')) {
      chip.classList.toggle('chip_selected', chip.textContent.toLowerCase() === this.#query.toLowerCase());
    }

    if (this.#vacancies) {
      this.#renderList();
    }
  }

  /**
   * Рисует вакансии, подходящие под текущий запрос, или пустое состояние.
   */
  #renderList() {
    const query = this.#query.toLowerCase();
    const vacancies = this.#vacancies
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
