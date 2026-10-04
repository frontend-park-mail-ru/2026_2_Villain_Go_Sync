import { logout } from '../api.js';
import { APP_NAME } from '../config.js';
import { isAuthorized, onSessionChange } from '../session.js';
import { loadTemplate } from '../template.js';
import { confirmAction } from './Modal.js';
import { showToast } from './toast.js';

const template = await loadTemplate(new URL('./Header.hbs', import.meta.url));

const LINKS = [{ title: 'Вакансии', href: '/' }];

/**
 * Шапка сайта: логотип, навигация и кнопки входа или меню профиля.
 */
export default class Header {
  /** @type {HTMLElement} */
  #container;

  /**
   * Рисует шапку в контейнер и перерисовывает её при входе и выходе пользователя.
   * @param {HTMLElement} container Контейнер шапки.
   */
  render(container) {
    this.#container = container;

    document.addEventListener('click', (event) => {
      if (event.target.closest('.header__logout')) {
        this.#setMenuOpen(false);
        this.#confirmLogout();
        return;
      }

      const profileButton = event.target.closest('.header__profile-button');

      // Любой другой клик — по пункту меню или мимо него — закрывает меню.
      this.#setMenuOpen(profileButton?.getAttribute('aria-expanded') === 'false');
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
  #update() {
    this.#container.innerHTML = template({ appName: APP_NAME, links: LINKS, isAuthorized: isAuthorized() });
  }

  /**
   * Открывает или закрывает меню профиля.
   * @param {boolean} isOpen Нужно ли показать меню.
   */
  #setMenuOpen(isOpen) {
    const menu = this.#container.querySelector('.header__menu');

    if (menu) {
      menu.hidden = !isOpen;
      this.#container.querySelector('.header__profile-button').setAttribute('aria-expanded', String(isOpen));
    }
  }

  /**
   * Спрашивает подтверждение и выходит из аккаунта.
   */
  async #confirmLogout() {
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
