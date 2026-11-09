import { confirmAction } from './components/Modal';

const HISTORY_INDEX = 'hirenoonIndex';

/**
 * Страница приложения.
 */
export interface Page {
  /** Рисует страницу в контейнер. */
  render(container: HTMLElement): void;
  /** Вызывается при уходе со страницы. */
  destroy?(): void;
  /** Есть ли несохранённые изменения, которые нужно подтвердить перед уходом. */
  hasUnsavedChanges?(): boolean;
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
  #historyIndex = 0;
  #isNavigating = false;
  #restoreHistory: (() => void) | null = null;
  #approvedPop = false;

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

    const index = window.history.state?.[HISTORY_INDEX];
    this.#historyIndex = Number.isInteger(index) ? index : 0;
    window.history.replaceState({ ...window.history.state, [HISTORY_INDEX]: this.#historyIndex }, '');
    window.addEventListener('popstate', (event) => { void this.#handlePopState(event); });
    window.addEventListener('beforeunload', (event) => {
      if (this.#currentPage?.hasUnsavedChanges?.()) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('click', (event) => this.#handleLinkClick(event));

    this.#render();
  }

  /**
   * Переходит на другую страницу без перезагрузки.
   * @param url Путь, например `/login`.
   * @param options Настройки перехода.
   * @param options.replace Заменить текущую запись в истории вместо добавления новой.
   * @param options.force Пропустить вопрос после сохранения формы или сохранения черновика.
   */
  async navigate(url: string, { replace = false, force = false }: { replace?: boolean; force?: boolean } = {}): Promise<void> {
    const target = new URL(url, window.location.origin);

    if (target.href === window.location.href || this.#isNavigating || target.origin !== window.location.origin) {
      return;
    }

    this.#isNavigating = true;
    try {
      if (!force && !(await this.#confirmLeave())) { return; }
      if (!replace) { this.#historyIndex++; }
      const state = { [HISTORY_INDEX]: this.#historyIndex };
      if (replace) { window.history.replaceState(state, '', target); }
      else { window.history.pushState(state, '', target); }
      this.#render();
      window.scrollTo(0, 0);
    } finally {
      this.#isNavigating = false;
    }
  }

  /**
   * Подтверждает потерю данных текущей страницы; смена сессии отменяет ожидающий переход.
   * @returns Можно ли покинуть страницу.
   */
  async #confirmLeave(): Promise<boolean> {
    const page = this.#currentPage;
    if (!page?.hasUnsavedChanges?.()) { return true; }
    const confirmed = await confirmAction({ title: 'Отменить изменения?', text: 'Несохранённые изменения будут потеряны.', confirmLabel: 'Отменить', cancelLabel: 'Остаться' });
    return confirmed && page === this.#currentPage;
  }

  /**
   * Восстанавливает позицию истории до вопроса, затем повторяет подтверждённый Back/Forward.
   * @param event Событие перехода по истории.
   */
  async #handlePopState(event: PopStateEvent): Promise<void> {
    if (this.#restoreHistory) {
      const restored = this.#restoreHistory;
      this.#restoreHistory = null;
      restored();
      return;
    }
    const index: unknown = event.state?.[HISTORY_INDEX];
    if (typeof index !== 'number' || !Number.isInteger(index)) { return; }
    if (this.#approvedPop || !this.#currentPage?.hasUnsavedChanges?.()) {
      this.#approvedPop = false;
      this.#historyIndex = index;
      this.#isNavigating = false;
      this.#render();
      return;
    }
    const delta = this.#historyIndex - index;
    if (delta === 0) { return; }
    if (this.#isNavigating) { window.history.go(delta); return; }
    const page = this.#currentPage;
    this.#isNavigating = true;
    await new Promise<void>((resolve) => { this.#restoreHistory = resolve; window.history.go(delta); });
    if (page !== this.#currentPage) { this.#isNavigating = false; return; }
    if (await this.#confirmLeave()) {
      this.#approvedPop = true;
      window.history.go(-delta);
    } else { this.#isNavigating = false; }
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
