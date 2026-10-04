import { getCurrentUser, logout } from '../api.js';
import { APP_NAME } from '../config.js';
import { onSessionChange } from '../session.js';
import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./Header.hbs', import.meta.url));

const LINKS = [{ title: 'Вакансии', href: '/' }];

/**
 * Шапка сайта: логотип, навигация и кнопки входа или выхода.
 */
export default class Header {
  /**
   * Рисует шапку в контейнер и перерисовывает её при входе и выходе пользователя.
   * @param {HTMLElement} container Контейнер шапки.
   */
  render(container) {
    const update = () => {
      container.innerHTML = template({
        appName: APP_NAME,
        links: LINKS,
        isAuthorized: Boolean(getCurrentUser()),
      });
    };

    container.addEventListener('click', (event) => {
      if (event.target.closest('.header__logout')) {
        logout();
      }
    });
    onSessionChange(update);

    update();
  }
}
