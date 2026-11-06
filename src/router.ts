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
  /** Значения параметров из пути, например `{ id: '42' }` для `/vacancies/:id`. */
  params: Record<string, string>;
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
 * Зарегистрированный маршрут вместе с шаблоном пути.
 */
interface CompiledRoute {
  /** Регулярное выражение для пути. */
  pattern: RegExp;
  /** Имена параметров в порядке их появления в пути. */
  keys: string[];
  /** Сам маршрут. */
  route: Route;
}

/**
 * Превращает путь с параметрами вида `/vacancies/:id` в регулярное выражение.
 * @param path Путь без завершающего слэша.
 * @returns Регулярное выражение и имена параметров.
 */
function compilePath(path: string): Pick<CompiledRoute, 'pattern' | 'keys'> {
  const keys: string[] = [];
  const source = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return { pattern: new RegExp(`^${source}$`), keys };
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
  #routes: CompiledRoute[] = [];
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
   * @param path Путь, например `/login` или `/vacancies/:id`.
   * @param route Страница и заголовок.
   * @returns Этот же роутер.
   */
  register(path: string, route: Route): this {
    this.#routes.push({ ...compilePath(normalizePath(path)), route });
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
   * Перерисовывает текущую страницу, например после входа или выхода:
   * заново проверяется доступ, и гостя уведёт со страниц для вошедших.
   */
  refresh(): void {
    this.#render();
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
   * Находит маршрут для пути и достаёт из него параметры.
   * @param path Путь без завершающего слэша.
   * @returns Маршрут и параметры; страница «не найдено», если путь не подошёл ни к одному маршруту.
   */
  #match(path: string): { route: Route; params: Record<string, string> } {
    for (const { pattern, keys, route } of this.#routes) {
      const match = pattern.exec(path);

      if (match) {
        try {
          const params = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));

          return { route, params };
        } catch {
          // Битая кодировка в адресе, например `/vacancies/%E0%A4%A`, — такой страницы нет.
          break;
        }
      }
    }

    return { route: this.#notFound!, params: {} };
  }

  /**
   * Рисует страницу для текущего адреса.
   */
  #render(): void {
    const path = normalizePath(window.location.pathname);
    const { route, params } = this.#match(path);
    const redirectUrl = route.redirect?.();

    if (redirectUrl) {
      window.history.replaceState(null, '', redirectUrl);
      this.#render();
      return;
    }

    // Окна подтверждения относятся к уходящей странице: если оставить их открытыми после «Назад»,
    // кнопка в окне выполнит действие над страницей, которой уже нет.
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      (dialog as HTMLDialogElement).close();
    }

    this.#currentPage?.destroy?.();
    this.#currentPage = new route.page({ router: this, params });

    document.title = `${route.title} — ${this.#appName}`;
    document.body.dataset.layout = route.layout ?? 'default';
    this.#currentPage.render(this.#container);
  }
}
