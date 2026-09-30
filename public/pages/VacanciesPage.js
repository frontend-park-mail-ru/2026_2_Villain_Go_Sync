import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./VacanciesPage.hbs', import.meta.url));

/**
 * Главная страница — лента вакансий.
 */
export default class VacanciesPage {
  /**
   * Рисует страницу в контейнер.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template();
  }
}
