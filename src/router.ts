/**
 * Страница приложения.
 */
export interface Page {
  /** Рисует страницу в контейнер. */
  render(container: HTMLElement): void;
  /** Вызывается при уходе со страницы. */
  destroy?(): void;
}

/**
 * Параметры, которые роутер передаёт в конструктор страницы.
 */
export interface PageProps {
  /** Роутер для переходов из кода. */
  router: Router;
}

/**
 * Маршрут: какую страницу показать и как оформить вкладку.
 */
export interface Route {
  /** Заголовок вкладки. */
  title: string;
  /** Класс страницы. */
  page: new (props: PageProps) => Page;
  /** Вариант оформления шапки, например `auth`. */
  layout?: string;
  /**
   * Проверка доступа: возвращает путь, на который нужно уйти вместо показа страницы,
   * или `null`, если страницу можно показать.
   */
  redirect?: () => string | null;
}

/**
 * Убирает завершающий слэш из пути.
 * @param path Путь, например `/login/`.
 * @returns Путь без завершающего слэша, например `/login`.
 */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Роутер SPA на History API.
 */
export default class Router {
  #routes = new Map<string, Route>();
  #notFound: Route | null = null;
  #currentPage: Page | null = null;
  #container: HTMLElement;
  #appName: string;

  /**
   * @param container Элемент, в который рендерятся страницы.
   * @param options Настройки.
   * @param options.appName Название приложения для заголовка вкладки.
   */
  constructor(container: HTMLElement, { appName }: { appName: string }) {
    this.#container = container;
    this.#appName = appName;
  }

  /**
   * Регистрирует маршрут.
   * @param path Путь, например `/login`.
   * @param route Страница и заголовок.
   * @returns Этот же роутер.
   */
  register(path: string, route: Route): this {
    this.#routes.set(normalizePath(path), route);
    return this;
  }

  /**
   * Задаёт страницу для неизвестных путей.
   * @param route Страница «не найдено».
   * @returns Этот же роутер.
   */
  setNotFound(route: Route): this {
    this.#notFound = route;
    return this;
  }

  /**
   * Подписывается на навигацию и рисует текущую страницу.
   */
  start(): void {
    if (!this.#notFound) {
      throw new Error('Router: перед start() нужно вызвать setNotFound()');
    }

    window.addEventListener('popstate', () => this.#render());
    document.addEventListener('click', (event) => this.#handleLinkClick(event));

    this.#render();
  }

  /**
   * Переходит на другую страницу без перезагрузки.
   * @param url Путь, например `/login`.
   * @param options Настройки перехода.
   * @param options.replace Заменить текущую запись в истории вместо добавления новой.
   */
  navigate(url: string, { replace = false }: { replace?: boolean } = {}): void {
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
   * @param event Событие клика.
   */
  #handleLinkClick(event: MouseEvent): void {
    const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

    if (event.defaultPrevented || event.button !== 0 || isModifiedClick) {
      return;
    }

    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;

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
  #render(): void {
    const path = normalizePath(window.location.pathname);
    const route = this.#routes.get(path) ?? this.#notFound!;
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
