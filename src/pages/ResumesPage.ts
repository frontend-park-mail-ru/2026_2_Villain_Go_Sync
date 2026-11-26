import { ListFilters } from '../components/ListFilters';
import { getMyApplications, deleteResume, getSeekerResumes, type Resume } from '../api';
import { confirmAction } from '../components/Modal';
import { renderPagination } from '../components/pagination';
import { showToast } from '../components/toast';
import type { Page } from '../router';
import { getCurrentUser } from '../session';
import template from './ResumesPage.hbs';
import resultsTemplate from './ResumesResults.hbs';

const SKELETON_COUNT = 6;
const PAGE_SIZE = 5;

/**
 * Страница «Мои резюме»: резюме вошедшего соискателя с поиском по названию.
 */
export default class ResumesPage implements Page {
  #abortController = new AbortController();
  #resumes: Resume[] | null = null;
  #listFilters = new ListFilters();
  #query = '';
  #page = 1;
  #isDeleting = false;
  #search!: HTMLFormElement;
  #input!: HTMLInputElement;
  #content!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает резюме.
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
        this.#listFilters.reset();
        this.#setQuery('');
      } else if (actionElement?.dataset.action === 'retry') {
        this.#load();
      }
    });

    this.#listFilters.mount(container, 'resumes', () => {
      this.#page = 1;
      if (this.#resumes) { this.#renderList(); }
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
   * Загружает резюме вошедшего пользователя.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;
    const userId = getCurrentUser()?.id ?? null;

    this.#resumes = null;
    this.#content.innerHTML = resultsTemplate({ isLoading: true, skeletons: Array.from({ length: SKELETON_COUNT }) });

    try {
      if (userId === null) {
        throw new Error('Не удалось узнать, кто вошёл в аккаунт');
      }

      this.#resumes = await getSeekerResumes(userId, { signal });
    } catch (error) {
      if (!signal.aborted) {
        this.#content.innerHTML = resultsTemplate({ error: (error as Error).message });
      }

      return;
    }

    this.#renderList();
    try {
      const applications = await getMyApplications(signal);
      if (signal.aborted) { return; }
      const counts = new Map<number, { total: number; fresh: number }>();
      for (const item of applications) {
        if (!item.resume_id) { continue; }
        const count = counts.get(item.resume_id) ?? { total: 0, fresh: 0 };
        count.total++;
        count.fresh = count.total;
        counts.set(item.resume_id, count);
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
    if (this.#resumes) { this.#renderList(); }
  }

  /**
   * Рисует текущую страницу резюме, подходящих под запрос, или пустое состояние.
   */
  #renderList(): void {
    const allResumes = this.#resumes ?? [];
    const query = this.#query.toLowerCase();
    const found = this.#listFilters.apply(allResumes.filter(({ title }) => title.toLowerCase().includes(query)), true);
    const pageCount = Math.ceil(found.length / PAGE_SIZE);

    // После удаления последнего резюме на странице возвращаемся на предыдущую.
    this.#page = Math.min(this.#page, Math.max(pageCount, 1));

    this.#content.innerHTML = resultsTemplate({
      resumes: found.slice((this.#page - 1) * PAGE_SIZE, this.#page * PAGE_SIZE),
      hasQuery: Boolean(query) || this.#listFilters.active,
      pagination: renderPagination(this.#page, pageCount),
    });
  }

  /**
   * Спрашивает подтверждение и удаляет резюме из списка.
   * @param id Идентификатор резюме.
   */
  async #confirmDelete(id: number): Promise<void> {
    if (this.#isDeleting) {
      return;
    }

    const isConfirmed = await confirmAction({
      title: 'Удалить резюме?',
      text: 'Восстановить его после удаления не получится.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
    });

    if (!isConfirmed) {
      return;
    }

    this.#isDeleting = true;

    try {
      await deleteResume(id);
    } catch (error) {
      showToast((error as Error).message, 'error');
      return;
    } finally {
      this.#isDeleting = false;
    }

    showToast('Резюме удалено');

    if (!this.#abortController.signal.aborted && this.#resumes) {
      this.#resumes = this.#resumes.filter((resume) => resume.id !== id);
      this.#renderList();
    }
  }
}
