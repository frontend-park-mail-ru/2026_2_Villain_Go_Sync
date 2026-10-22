import type { Page } from '../router';
import template from './NotFoundPage.hbs';

/**
 * Страница 404.
 */
export default class NotFoundPage implements Page {
  /**
   * Рисует страницу в контейнер.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    container.innerHTML = template();
  }
}
