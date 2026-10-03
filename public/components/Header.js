import { APP_NAME } from '../config.js';
import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./Header.hbs', import.meta.url));

const LINKS = [{ title: 'Вакансии', href: '/' }];

/**
 * Шапка сайта: логотип, навигация и кнопки входа.
 */
export default class Header {
  /**
   * Рисует шапку в контейнер.
   * @param {HTMLElement} container Контейнер шапки.
   */
  render(container) {
    container.innerHTML = template({ appName: APP_NAME, links: LINKS });
  }
}
