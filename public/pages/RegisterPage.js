import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./RegisterPage.hbs', import.meta.url));

/**
 * Страница регистрации.
 */
export default class RegisterPage {
  /**
   * Рисует страницу в контейнер.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template();
    container.querySelector('.auth__form').addEventListener('submit', (event) => event.preventDefault());
  }
}
