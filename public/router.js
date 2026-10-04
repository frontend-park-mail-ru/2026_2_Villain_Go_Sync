/**
 * @typedef {object} Page
 * @property {(container: HTMLElement) => void} render Рисует страницу в контейнер.
 * @property {() => void} [destroy] Вызывается при уходе со страницы.
 */

/**
 * @typedef {object} Route
 * @property {string} title Заголовок вкладки.
 * @property {new (props: { router: Router }) => Page} page Класс страницы.
 * @property {string} [layout] Вариант оформления шапки, например `auth`.
 * @property {() => string | null} [redirect] Проверка доступа: возвращает путь, на который нужно уйти
 * вместо показа страницы, или `null`, если страницу можно показать.
 */

/**
 * Убирает завершающий слэш из пути.
 * @param {string} path Путь, например `/login/`.
 * @returns {string} Путь без завершающего слэша, например `/login`.
 */
function normalizePath(path) {
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Роутер SPA на History API.
 */
export default class Router {
  /** @type {Map<string, Route>} */
  #routes = new Map();

  /** @type {Route | null} */
  #notFound = null;

  /** @type {Page | null} */
  #currentPage = null;

  #container;
  #appName;

  /**
   * @param {HTMLElement} container Элемент, в который рендерятся страницы.
   * @param {object} options Настройки.
   * @param {string} options.appName Название приложения для заголовка вкладки.
   */
  constructor(container, { appName }) {
    this.#container = container;
    this.#appName = appName;
  }

  /**
   * Регистрирует маршрут.
   * @param {string} path Путь, например `/login`.
   * @param {Route} route Страница и заголовок.
   * @returns {Router} Этот же роутер.
   */
  register(path, route) {
    this.#routes.set(normalizePath(path), route);
    return this;
  }

  /**
   * Задаёт страницу для неизвестных путей.
   * @param {Route} route Страница «не найдено».
   * @returns {Router} Этот же роутер.
   */
  setNotFound(route) {
    this.#notFound = route;
    return this;
  }

  /**
   * Подписывается на навигацию и рисует текущую страницу.
   */
  start() {
    if (!this.#notFound) {
      throw new Error('Router: перед start() нужно вызвать setNotFound()');
    }

    window.addEventListener('popstate', () => this.#render());
    document.addEventListener('click', (event) => this.#handleLinkClick(event));

    this.#render();
  }

  /**
   * Переходит на другую страницу без перезагрузки.
   * @param {string} url Путь, например `/login`.
   * @param {object} [options] Настройки перехода.
   * @param {boolean} [options.replace] Заменить текущую запись в истории вместо добавления новой.
   */
  navigate(url, { replace = false } = {}) {
    const target = new URL(url, window.location.origin);

    if (target.href === window.location.href) {
      return;
    }

    if (replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }

    this.#render();
    window.scrollTo(0, 0);
  }

  /**
   * Обрабатывает клики по внутренним ссылкам через роутер.
   * @param {MouseEvent} event Событие клика.
   */
  #handleLinkClick(event) {
    const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

    if (event.defaultPrevented || event.button !== 0 || isModifiedClick) {
      return;
    }

    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;

    if (
      !link ||
      link.origin !== window.location.origin ||
      (link.target && link.target !== '_self') ||
      link.hasAttribute('download')
    ) {
      return;
    }

    const isSamePageAnchor =
      link.hash && link.pathname === window.location.pathname && link.search === window.location.search;

    if (isSamePageAnchor) {
      return;
    }

    event.preventDefault();
    this.navigate(link.href);
  }

  /**
   * Рисует страницу для текущего адреса.
   */
  #render() {
    const path = normalizePath(window.location.pathname);
    const route = this.#routes.get(path) ?? this.#notFound;
    const redirectUrl = route.redirect?.();

    if (redirectUrl) {
      window.history.replaceState(null, '', redirectUrl);
      this.#render();
      return;
    }

    this.#currentPage?.destroy?.();
    this.#currentPage = new route.page({ router: this });

    document.title = `${route.title} — ${this.#appName}`;
    document.body.dataset.layout = route.layout ?? 'default';
    this.#currentPage.render(this.#container);
  }
}
