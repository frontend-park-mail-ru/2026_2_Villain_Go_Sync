const template = Handlebars.compile(`
  <section class="page-stub">
    <h1 class="page-stub__title">Вход</h1>
    <p class="page-stub__text">Здесь будет форма авторизации.</p>
  </section>
`);

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
