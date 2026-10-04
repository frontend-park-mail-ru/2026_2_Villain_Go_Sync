import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./NotFoundPage.hbs', import.meta.url));

/**
 * Страница 404.
 */
export default class NotFoundPage {
  /**
   * Рисует страницу в контейнер.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template();
  }
}
