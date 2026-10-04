const template = Handlebars.compile(`
  <section class="page-stub">
    <h1 class="page-stub__title">Регистрация</h1>
    <p class="page-stub__text">Здесь будет форма регистрации.</p>
  </section>
`);

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
  }
}
