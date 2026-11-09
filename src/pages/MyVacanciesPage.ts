import { mountCardImages } from '../components/profile-images';
import { deleteVacancy, getEmployerVacancies, type Vacancy } from '../api';
import { confirmAction } from '../components/Modal';
import { renderPagination } from '../components/pagination';
import { showToast } from '../components/toast';
import { formatSalary } from '@hirenoon/format';
import type { Page } from '../router';
import template from './MyVacanciesPage.hbs';
import resultsTemplate from './MyVacanciesResults.hbs';

const SKELETON_COUNT = 3;
const PAGE_SIZE = 12;

/**
 * Страница «Мои вакансии»: вакансии вошедшего работодателя с поиском по названию.
 */
export default class MyVacanciesPage implements Page {
  #abortController = new AbortController();
  #vacancies: Vacancy[] | null = null;
  #query = '';
  #page = 1;
  #isDeleting = false;
  #search!: HTMLFormElement;
  #input!: HTMLInputElement;
  #content!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает вакансии.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    container.innerHTML = template();

    this.#search = container.querySelector<HTMLFormElement>('.owner-list__search')!;
    this.#input = this.#search.querySelector<HTMLInputElement>('.owner-list__search-input')!;
    this.#content = container.querySelector<HTMLElement>('.owner-list__content')!;

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
        this.#confirmDelete(Number(actionElement.dataset.id));
      } else if (actionElement?.dataset.action === 'reset') {
        this.#setQuery('');
      } else if (actionElement?.dataset.action === 'retry') {
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
   * Загружает вакансии вошедшего работодателя и название его компании.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;

    this.#vacancies = null;
    this.#search.hidden = true;
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
  }

  /**
   * Запоминает поисковый запрос и показывает первую страницу результатов.
   * @param query Текст запроса.
   */
  #setQuery(query: string): void {
    this.#query = query.trim();
    this.#page = 1;
    this.#input.value = this.#query;
    this.#renderList();
  }

  /**
   * Рисует текущую страницу вакансий, подходящих под запрос, или пустое состояние.
   */
  #renderList(): void {
    const allVacancies = this.#vacancies ?? [];
    const query = this.#query.toLowerCase();
    const found = allVacancies.filter(({ title }) => title.toLowerCase().includes(query));
    const pageCount = Math.ceil(found.length / PAGE_SIZE);

    // После удаления последней вакансии на странице возвращаемся на предыдущую.
    this.#page = Math.min(this.#page, Math.max(pageCount, 1));

    // Поиск не нужен, пока вакансий нет совсем.
    this.#search.hidden = allVacancies.length === 0;

    this.#content.innerHTML = resultsTemplate({
      vacancies: found
        .slice((this.#page - 1) * PAGE_SIZE, this.#page * PAGE_SIZE)
        .map(({ id, title, description, salary_from: from, salary_to: to, currency, company_name: company, logo_url: logoUrl }) => ({
          company,
          logoUrl,
          id,
          title,
          description,
          salary: formatSalary(from, to, currency),
          hasSalary: (from !== null && from !== undefined) || (to !== null && to !== undefined),
        })),
      hasQuery: Boolean(query),
      pagination: renderPagination(this.#page, pageCount),
    });
    mountCardImages(this.#content);
  }

  /**
   * Спрашивает подтверждение и удаляет вакансию из списка.
   * @param id Идентификатор вакансии.
   */
  async #confirmDelete(id: number): Promise<void> {
    if (this.#isDeleting) {
      return;
    }

    const isConfirmed = await confirmAction({
      title: 'Удалить вакансию?',
      text: 'Восстановить её после удаления не получится.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
    });

    if (!isConfirmed) {
      return;
    }

    this.#isDeleting = true;

    try {
      await deleteVacancy(id);
    } catch (error) {
      showToast((error as Error).message, 'error');
      return;
    } finally {
      this.#isDeleting = false;
    }

    showToast('Вакансия удалена');

    if (!this.#abortController.signal.aborted && this.#vacancies) {
      this.#vacancies = this.#vacancies.filter((vacancy) => vacancy.id !== id);
      this.#renderList();
    }
  }
}
