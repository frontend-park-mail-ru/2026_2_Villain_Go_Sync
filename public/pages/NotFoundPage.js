const template = Handlebars.compile(`
  <section class="page-stub">
    <h1 class="page-stub__title">Страница не найдена</h1>
    <p class="page-stub__text">Такой страницы нет. <a href="/">Вернуться к вакансиям</a></p>
  </section>
`);

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
