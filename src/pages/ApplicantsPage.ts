import { mountCardImages } from '../components/profile-images';
import { getEmployerApplicants, type Applicant } from '../api';
import { renderPagination } from '../components/pagination';
import type { Page } from '../router';
import template from './ApplicantsPage.hbs';
import resultsTemplate from './ApplicantsResults.hbs';

const SKELETON_COUNT = 3;
const PAGE_SIZE = 12;

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Новый отклик бэкенд отдаёт как pending, хотя в базе такого статуса нет; оба значения — «Новый».
const STATUSES: Record<string, { type: string; label: string }> = {
  pending: { type: 'new', label: 'Новый' },
  created: { type: 'new', label: 'Новый' },
  viewed: { type: 'viewed', label: 'Просмотрен' },
  interview: { type: 'interview', label: 'Собеседование' },
  accepted: { type: 'accepted', label: 'Принят' },
  rejected: { type: 'rejected', label: 'Отклонён' },
};

/**
 * Страница «Соискатели»: отклики на все вакансии вошедшего работодателя.
 */
export default class ApplicantsPage implements Page {
  #abortController = new AbortController();
  #applicants: Applicant[] | null = null;
  #query = '';
  #page = 1;
  #search!: HTMLFormElement;
  #input!: HTMLInputElement;
  #content!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает отклики.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    container.innerHTML = template();

    this.#search = container.querySelector<HTMLFormElement>('.applicants__search')!;
    this.#input = this.#search.querySelector<HTMLInputElement>('#applicants-query')!;
    this.#content = container.querySelector<HTMLElement>('.applicants__content')!;

    this.#search.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#setQuery(this.#input.value);
    });

    this.#content.addEventListener('click', (event) => {
      const target = event.target as Element;
      const page = target.closest<HTMLElement>('[data-page]')?.dataset.page;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;

      if (page) {
        this.#page = Number(page);
        this.#renderList();
        window.scrollTo(0, 0);
      } else if (action === 'reset') {
        this.#setQuery('');
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
   * Загружает общий список откликов работодателя.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;

    this.#applicants = null;
    this.#search.hidden = true;
    this.#content.innerHTML = resultsTemplate({ isLoading: true, skeletons: Array.from({ length: SKELETON_COUNT }) });

    try {
      this.#applicants = (await getEmployerApplicants({ signal }))
        .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());
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
   * Рисует текущую страницу откликов, подходящих под запрос, или пустое состояние.
   */
  #renderList(): void {
    const allApplicants = this.#applicants ?? [];
    const query = this.#query.toLowerCase();
    const found = allApplicants.filter((applicant) =>
      [applicant.first_name, applicant.last_name, applicant.resume_title, applicant.vacancy_title]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
    const pageCount = Math.ceil(found.length / PAGE_SIZE);

    this.#page = Math.min(this.#page, Math.max(pageCount, 1));

    this.#search.hidden = false;

    this.#content.innerHTML = resultsTemplate({
      applicants: found.slice((this.#page - 1) * PAGE_SIZE, this.#page * PAGE_SIZE).map((applicant) => {
        const date = new Date(applicant.applied_at);

        return {
          name: `${applicant.first_name} ${applicant.last_name}`.trim(),
          initials: [applicant.first_name, applicant.last_name]
            .map((word) => word.trim().charAt(0).toUpperCase())
            .join(''),
          status: STATUSES[applicant.status] ?? { type: 'unknown', label: 'Неизвестный статус' },
          date: Number.isNaN(date.getTime()) ? '' : dateFormat.format(date),
          vacancy: applicant.vacancy_title,
          resume: applicant.resume_title,
          resumeId: applicant.resume_id,
          avatarUrl: applicant.avatar_url,
          coverLetter: applicant.cover_letter,
        };
      }),
      hasQuery: Boolean(query),
      pagination: renderPagination(this.#page, pageCount),
    });
    mountCardImages(this.#content);
  }
}
