import { openApplicantPreview } from '../components/ApplicantPreview';
import { mountCardImages } from '../components/profile-images';
import { getEmployerApplicants, type Applicant } from '../api';
import { renderPagination } from '../components/pagination';
import type { Page } from '../router';
import template from './ApplicantsPage.hbs';
import resultsTemplate from './ApplicantsResults.hbs';

const SKELETON_COUNT = 3;
const PAGE_SIZE = 12;

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Старые записи и текущий API используют разные названия некоторых этапов.
const STATUSES: Record<string, { type: string; label: string }> = {
  pending: { type: 'new', label: 'Новый' },
  created: { type: 'new', label: 'Новый' },
  reviewing: { type: 'viewed', label: 'Рассмотрение' },
  offer: { type: 'accepted', label: 'Предложение' },
  viewed: { type: 'viewed', label: 'Просмотрен' },
  interview: { type: 'interview', label: 'Собеседование' },
  accepted: { type: 'accepted', label: 'Принят' },
  rejected: { type: 'rejected', label: 'Отклонён' },
};

/**
 * Страница «Отклики»: отклики на все вакансии вошедшего работодателя.
 */
export default class ApplicantsPage implements Page {
  #abortController = new AbortController();
  #applicants: Applicant[] | null = null;
  #query = '';
  #view = 'board';
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

    this.#search.addEventListener('input', () => this.#setQuery(this.#input.value));
    this.#search.addEventListener('reset', (event) => {
      event.preventDefault();
      this.#input.value = '';
      for (const select of this.#search.querySelectorAll('select')) { select.selectedIndex = 0; }
      this.#setQuery('');
    });
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.addEventListener('click', () => {
        this.#view = button.dataset.view!;
        container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        if (this.#applicants) { this.#renderList(); }
      });
    }

    const openPreview = (id: number, nextStage?: string): void => {
      const applicant = this.#applicants?.find((item) => item.application_id === id);
      if (!applicant) { return; }
      const date = new Date(applicant.applied_at);
      openApplicantPreview(container, applicant, {
        date: Number.isNaN(date.getTime()) ? '' : dateFormat.format(date),
        status: STATUSES[applicant.status]?.label ?? 'Неизвестный статус',
      }, this.#abortController.signal, () => this.#renderList(), nextStage);
    };

    let dragged: HTMLElement | null = null;
    this.#content.addEventListener('dragstart', (event) => {
      dragged = (event.target as Element).closest<HTMLElement>('[data-candidate][draggable]');
      if (dragged && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragged.dataset.candidate!);
      }
    });
    this.#content.addEventListener('dragend', () => { dragged = null; });
    this.#content.addEventListener('dragover', (event) => {
      const column = (event.target as Element).closest<HTMLElement>('[data-stage]');
      if (dragged && column?.dataset.stage && !column.contains(dragged)) { event.preventDefault(); }
    });
    this.#content.addEventListener('drop', (event) => {
      const column = (event.target as Element).closest<HTMLElement>('[data-stage]');
      if (!dragged || !column?.dataset.stage || column.contains(dragged)) { return; }
      event.preventDefault();
      openPreview(Number(dragged.dataset.candidate), column.dataset.stage);
      dragged = null;
    });

    this.#content.addEventListener('click', (event) => {
      const target = event.target as Element;
      const page = target.closest<HTMLElement>('[data-page]')?.dataset.page;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;

      const preview = target.closest<HTMLElement>('[data-preview]');
      if (preview) {
        openPreview(Number(preview.dataset.preview));
      } else if (page) {
        this.#page = Number(page);
        this.#renderList();
        window.scrollTo(0, 0);
      } else if (action === 'reset') {
        this.#search.reset();
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

    const select = this.#search.elements.namedItem('vacancy') as HTMLSelectElement;
    const vacancies = new Map(this.#applicants.map((item) => [item.vacancy_id, item.vacancy_title]));
    for (const [id, title] of vacancies) { select.add(new Option(title, String(id))); }
    const initialVacancy = Number(new URLSearchParams(location.search).get('vacancy'));
    if (vacancies.has(initialVacancy)) { select.value = String(initialVacancy); }
    this.#renderList();
  }

  /**
   * Запоминает поисковый запрос и показывает первую страницу результатов.
   * @param query Текст запроса.
   */
  #setQuery(query: string): void {
    this.#query = query.trim();
    this.#page = 1;

    this.#renderList();
  }

  /**
   * Рисует текущую страницу откликов, подходящих под запрос, или пустое состояние.
   */
  #renderList(): void {
    const allApplicants = this.#applicants ?? [];
    const query = this.#query.toLowerCase();
    const data = new FormData(this.#search);
    const vacancy = Number(data.get('vacancy'));
    const days = Number(data.get('days'));
    const found = allApplicants.filter((applicant) =>
      (!vacancy || applicant.vacancy_id === vacancy) &&
      (!days || Date.parse(applicant.applied_at) >= Date.now() - days * 86400000) &&
      [applicant.first_name, applicant.last_name, applicant.resume_title, applicant.vacancy_title]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
    const pageCount = Math.ceil(found.length / PAGE_SIZE);

    this.#page = Math.min(this.#page, Math.max(pageCount, 1));

    this.#search.hidden = false;

    const records = this.#view === 'board' ? found : found.slice((this.#page - 1) * PAGE_SIZE, this.#page * PAGE_SIZE);
    const applicants = records.map((applicant) => {
      const date = new Date(applicant.applied_at);

      return {
        id: applicant.application_id,
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
    });
    const stages = [
      ['new', 'Новые'], ['viewed', 'Рассмотрение'], ['interview', 'Собеседование'],
      ['accepted', 'Предложение'], ['rejected', 'Отказ'],
    ];
    if (applicants.some((item) => item.status.type === 'unknown')) { stages.push(['unknown', 'Другой статус']); }
    this.#content.innerHTML = resultsTemplate({
      applicants, total: found.length,
      board: this.#view === 'board', table: this.#view === 'table',
      columns: stages.map(([type, title]) => {
        const cards = applicants.filter((item) => item.status.type === type);
        const stage = ({ viewed: 'reviewing', interview: 'interview', accepted: 'offer', rejected: 'rejected' } as Record<string, string>)[type];
        return { type, title, stage, count: cards.length, cards };
      }),
      hasQuery: Boolean(query || vacancy || days),
      pagination: this.#view === 'board' ? '' : renderPagination(this.#page, pageCount),
    });
    mountCardImages(this.#content);
  }
}
