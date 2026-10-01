import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./LoginPage.hbs', import.meta.url));

/**
 * Страница авторизации.
 */
export default class LoginPage {
  /**
   * Рисует страницу в контейнер.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template();
  }
}
