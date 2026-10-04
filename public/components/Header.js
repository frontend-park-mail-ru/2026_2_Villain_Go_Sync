import { APP_NAME } from '../config.js';

const template = Handlebars.compile(`
  <div class="header">
    <a class="header__logo" href="/">{{appName}}</a>
    <nav class="header__nav">
      {{#each links}}
        <a class="header__link" href="{{href}}">{{title}}</a>
      {{/each}}
    </nav>
  </div>
`);

const LINKS = [
  { title: 'Вакансии', href: '/' },
  { title: 'Войти', href: '/login' },
  { title: 'Регистрация', href: '/register' },
];

/**
 * Шапка сайта: логотип и навигация.
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
