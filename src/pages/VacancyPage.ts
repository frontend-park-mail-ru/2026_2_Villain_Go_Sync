import { ApiError, deleteVacancy, getEmployer, getVacancy, type Vacancy } from '../api';
import { confirmAction } from '../components/Modal';
import { showToast } from '../components/toast';
import { formatSalary } from '../format';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getCurrentUser, isAuthorized } from '../session';
import template from './VacancyPage.hbs';

/**
 * Страница одной вакансии: для работодателя-владельца — с кнопками редактирования и удаления,
 * для остальных — с кнопкой отклика.
 */
export default class VacancyPage implements Page {
  #router: Router;
  #id: number;
  #abortController = new AbortController();
  #container!: HTMLElement;
  #isDeleting = false;

  /**
   * @param props Параметры страницы.
   * @param props.router Роутер для перехода после удаления.
   * @param props.params Параметры пути; `id` — идентификатор вакансии.
   */
  constructor({ router, params }: PageProps) {
    this.#router = router;
    this.#id = Number(params.id);
  }

  /**
   * Рисует страницу в контейнер и загружает вакансию.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    this.#container = container;

    // Контейнер общий для всех страниц, поэтому обработчик снимается в destroy через signal.
    container.addEventListener(
      'click',
      (event) => {
        const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;

        if (action === 'retry') {
          this.#load();
        } else if (action === 'delete') {
          this.#confirmDelete();
        }
      },
      { signal: this.#abortController.signal },
    );

    this.#load();
  }

  /**
   * Вызывается при уходе со страницы: отменяет загрузку.
   */
  destroy(): void {
    this.#abortController.abort();
  }

  /**
   * Загружает вакансию и название компании и показывает их.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;

    this.#container.innerHTML = template({ isLoading: true });

    if (!Number.isInteger(this.#id) || this.#id <= 0) {
      this.#renderNotFound();
      return;
    }

    let vacancy: Vacancy;

    try {
      vacancy = await getVacancy(this.#id, { signal });
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

      return;
    }

    // Название компании приходит отдельным запросом; если профиль не заполнен, страница обходится без него.
    const company = await getEmployer(vacancy.employer_id, { signal }).then(
      (employer) => employer.company_name,
      () => '',
    );

    if (signal.aborted) {
      return;
    }

    const user = getCurrentUser();
    const isOwner = user?.id !== null && user?.id === vacancy.employer_id;

    this.#container.innerHTML = template({
      vacancy,
      company,
      isOwner,
      canApply: !isAuthorized(),
      salary: formatSalary(vacancy.salary_from, vacancy.salary_to),
      hasSalary: (vacancy.salary_from ?? 0) > 0 || (vacancy.salary_to ?? 0) > 0,
    });
  }

  /**
   * Показывает, что такой вакансии нет.
   */
  #renderNotFound(): void {
    this.#container.innerHTML = template({
      error: { title: 'Вакансия не найдена', text: 'Возможно, её удалили или ссылка устарела.' },
    });
  }

  /**
   * Спрашивает подтверждение, удаляет вакансию и возвращает к списку.
   */
  async #confirmDelete(): Promise<void> {
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
      await deleteVacancy(this.#id);
    } catch (error) {
      showToast((error as Error).message, 'error');
      return;
    } finally {
      this.#isDeleting = false;
    }

    showToast('Вакансия удалена');
    this.#router.navigate('/');
  }
}
