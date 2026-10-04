const template = Handlebars.compile(`
  <section class="page-stub">
    <h1 class="page-stub__title">Вакансии</h1>
    <p class="page-stub__text">Здесь будет лента вакансий.</p>
  </section>
`);

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
