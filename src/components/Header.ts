import { logout } from '../api';
import { APP_NAME } from '../config';
import { getCurrentUser, isAuthorized, onSessionChange } from '../session';
import template from './Header.hbs';
import { confirmAction } from './Modal';
import { showToast } from './toast';

const LINKS = [{ title: 'Вакансии', href: '/' }];
const SEEKER_LINKS = [...LINKS, { title: 'Мои резюме', href: '/resumes' }];
const EMPLOYER_LINKS = [
  ...LINKS,
  { title: 'Мои вакансии', href: '/my/vacancies' },
  { title: 'Соискатели', href: '/applicants' },
];

/**
 * Шапка сайта: логотип, навигация и кнопки входа или меню профиля.
 */
export default class Header {
  #container!: HTMLElement;

  /**
   * Рисует шапку в контейнер и перерисовывает её при входе и выходе пользователя.
   * @param container Контейнер шапки.
   */
  render(container: HTMLElement): void {
    this.#container = container;

    document.addEventListener('click', (event) => {
      const target = event.target as Element;

      if (target.closest('.header__logout')) {
        this.#setMenuOpen(false);
        this.#confirmLogout();
        return;
      }

      const avatar = target.closest('.header__avatar');

      // Любой другой клик — по пункту меню или мимо него — закрывает меню.
      this.#setMenuOpen(avatar?.getAttribute('aria-expanded') === 'false');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.#setMenuOpen(false);
      }
    });

    onSessionChange(() => this.#update());
    this.#update();
  }

  /**
   * Рисует шапку для гостя или для вошедшего пользователя.
   */
  #update(): void {
    // При неизвестной роли оставляем только общую навигацию.
    const role = getCurrentUser()?.role;
    const links = role === 'seeker' ? SEEKER_LINKS : role === 'employer' ? EMPLOYER_LINKS : LINKS;

    this.#container.innerHTML = template({ appName: APP_NAME, links, isAuthorized: isAuthorized() });
  }

  /**
   * Открывает или закрывает меню профиля.
   * @param isOpen Нужно ли показать меню.
   */
  #setMenuOpen(isOpen: boolean): void {
    const menu = this.#container.querySelector<HTMLElement>('.header__menu');

    if (menu) {
      menu.hidden = !isOpen;
      this.#container.querySelector('.header__avatar')!.setAttribute('aria-expanded', String(isOpen));
    }
  }

  /**
   * Спрашивает подтверждение и выходит из аккаунта.
   */
  async #confirmLogout(): Promise<void> {
    const isConfirmed = await confirmAction({
      title: 'Выйти из аккаунта?',
      text: 'Вы уверены, что хотите выйти?',
      confirmLabel: 'Выйти',
      cancelLabel: 'Отмена',
    });

    if (!isConfirmed) {
      return;
    }

    try {
      await logout();
      showToast('Вы вышли из аккаунта');
    } catch {
      showToast('Не удалось выйти из аккаунта', 'error');
    }
  }
}
