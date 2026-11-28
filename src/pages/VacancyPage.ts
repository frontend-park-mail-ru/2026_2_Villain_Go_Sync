import { conditions, workLabel } from '../components/work-options';
import { isFavorite, toggleFavorite } from '../components/favorites';
import { getMyApplications, ApiError, deleteVacancy, getSeekerResumes, getVacancy, type Vacancy } from '../api';
import { openApplicationDialog } from '../components/ApplicationDialog';
import { setLoading } from '../components/form';
import { confirmAction } from '../components/Modal';
import { showToast } from '../components/toast';
import { formatSalary } from '@hirenoon/format';
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
  #isApplying = false;

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
        } else if (action === 'apply') {
          this.#apply(event.target as Element);
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

    if (signal.aborted) {
      return;
    }

    const user = getCurrentUser();
    const isOwner = user?.id !== null && user?.id === vacancy.employer_id;

    this.#container.innerHTML = template({
      vacancy, conditions: conditions(vacancy), level: workLabel('experience_level', vacancy.experience_level),
      company: vacancy.company_name,
      companyPath: Number.isSafeInteger(vacancy.employer_id) && vacancy.employer_id > 0 ? `/employers/${vacancy.employer_id}` : '',
      isOwner,
      // Гостя кнопка отклика ведёт на вход, работодателю отклик не нужен.
      isGuest: !isAuthorized(),
      showActions: isOwner || user?.role !== 'employer',
      published: Number.isNaN(Date.parse(vacancy.created_at)) ? '' : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(new Date(vacancy.created_at)),
      favorite: isFavorite(vacancy.id),
      salary: formatSalary(vacancy.salary_from, vacancy.salary_to, vacancy.currency),
      hasSalary: (vacancy.salary_from !== null && vacancy.salary_from !== undefined) || (vacancy.salary_to !== null && vacancy.salary_to !== undefined),
    });
    const favorite = this.#container.querySelector<HTMLButtonElement>('[data-favorite]');
    favorite?.addEventListener('click', () => toggleFavorite(vacancy, favorite));
    if (user?.role === 'seeker') {
      try {
        const mine = await getMyApplications(signal);
        const button = this.#container.querySelector<HTMLButtonElement>('[data-action="apply"]');
        if (!signal.aborted && button && mine.some((item) => item.vacancy_id === vacancy.id)) {
          button.disabled = true;
          button.textContent = button.dataset.label = 'Вы уже откликнулись';
        }
      } catch { /* API отклонит дубликат, даже если список временно недоступен. */ }
    }
  }

  /**
   * Загружает резюме соискателя и открывает окно отклика.
   * @param target Элемент, по которому кликнули.
   */
  async #apply(target: Element): Promise<void> {
    const button = target.closest<HTMLButtonElement>('[data-action="apply"]')!;
    const userId = getCurrentUser()?.id ?? null;

    if (this.#isApplying) {
      return;
    }

    if (userId === null) {
      showToast('Не удалось узнать, кто вошёл в аккаунт', 'error');
      return;
    }

    this.#isApplying = true;
    setLoading(button, true);

    try {
      const resumes = await getSeekerResumes(userId, { signal: this.#abortController.signal });

      setLoading(button, false);
      if (this.#abortController.signal.aborted) { return; }
      if (await openApplicationDialog(this.#id, resumes, this.#abortController.signal)) {
        button.disabled = true;
        button.dataset.label = 'Вы уже откликнулись';
      }
    } catch (error) {
      if (!this.#abortController.signal.aborted) {
        showToast((error as Error).message, 'error');
      }
    } finally {
      this.#isApplying = false;
      setLoading(button, false);
    }
  }

  /**
   * Показывает, что такой вакансии нет.
   */
  #renderNotFound(): void {
    this.#container.innerHTML = template({
      error: { title: 'Вакансия не найдена', text: 'Возможно, её удалили или ссылка устарела' },
    });
  }

  /**
   * Спрашивает подтверждение, удаляет вакансию и возвращает к списку вакансий работодателя.
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
    this.#router.navigate('/my/vacancies');
  }
}
