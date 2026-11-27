import { recordText, conditions } from '../components/work-options';
import { ApiError, deleteResume, getResume, type Resume } from '../api';
import { confirmAction } from '../components/Modal';
import { showToast } from '../components/toast';
import type { Page, PageProps } from '../router';
import type Router from '../router';
import { getCurrentUser } from '../session';
import template from './ResumePage.hbs';

const SKELETON_SECTIONS = 3;

/**
 * Страница одного резюме: владельцу доступны редактирование и удаление.
 */
export default class ResumePage implements Page {
  #router: Router;
  #id: number;
  #abortController = new AbortController();
  #container!: HTMLElement;
  #isDeleting = false;

  /**
   * @param props Параметры страницы.
   * @param props.router Роутер для перехода после удаления.
   * @param props.params Параметры пути; `id` — идентификатор резюме.
   */
  constructor({ router, params }: PageProps) {
    this.#router = router;
    this.#id = Number(params.id);
  }

  /**
   * Рисует страницу в контейнер и загружает резюме.
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
        } else if (action === 'print') {
          window.print();
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
   * Загружает резюме и показывает его.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;

    this.#container.innerHTML = template({
      isLoading: true,
      skeletonSections: Array.from({ length: SKELETON_SECTIONS }),
    });

    if (!Number.isInteger(this.#id) || this.#id <= 0) {
      this.#renderNotFound();
      return;
    }

    let resume: Resume;

    try {
      resume = await getResume(this.#id, { signal });
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        this.#renderNotFound();
      } else {
        this.#container.innerHTML = template({
          error: { title: 'Не удалось загрузить резюме', text: (error as Error).message, canRetry: true },
        });
      }

      return;
    }

    const user = getCurrentUser();
    const sections = [
      { title: 'О себе', text: resume.description },
      { title: 'Желаемая работа', text: [resume.target_position, conditions(resume), typeof resume.salary_from === 'number' ? 'от ' + resume.salary_from.toLocaleString('ru-RU') + ' ₽' : ''].filter(Boolean).join(' · ') },
      { title: 'Опыт работы', text: [resume.experience, recordText(resume.experience_items)].filter(Boolean).join('\n') },
      { title: 'Образование', text: [resume.education, recordText(resume.education_items)].filter(Boolean).join('\n') },
      { title: 'Навыки', text: resume.skills?.map((v) => v.name).join(' · ') },
      { title: 'Портфолио и проекты', text: [resume.portfolio_url, recordText(resume.projects)].filter(Boolean).join('\n') },
      { title: 'Языки', text: resume.languages },
    ].filter(({ text }) => text?.trim());

    this.#container.innerHTML = template({
      resume,
      sections,
      showSeekerProfile: user?.role === 'employer' && Number.isSafeInteger(resume.seeker_id) && resume.seeker_id > 0,
      isOwner: user?.id !== null && user?.id === resume.seeker_id,
    });
  }

  /**
   * Показывает, что такого резюме нет.
   */
  #renderNotFound(): void {
    this.#container.innerHTML = template({
      error: { title: 'Резюме не найдено', text: 'Возможно, его удалили или ссылка устарела' },
    });
  }

  /**
   * Спрашивает подтверждение, удаляет резюме и возвращает к списку резюме.
   */
  async #confirmDelete(): Promise<void> {
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
      await deleteResume(this.#id);
    } catch (error) {
      showToast((error as Error).message, 'error');
      return;
    } finally {
      this.#isDeleting = false;
    }

    showToast('Резюме удалено');
    this.#router.navigate('/resumes');
  }
}
