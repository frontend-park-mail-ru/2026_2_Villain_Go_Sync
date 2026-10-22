import { API_URL } from './config';
import { setAuthorized } from './session';

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Не удалось связаться с сервером',
  400: 'Некорректный запрос',
  401: 'Нужно войти в аккаунт',
  404: 'Не найдено',
  409: 'Такие данные уже существуют',
  422: 'Проверьте правильность заполнения полей',
};

export type UserRole = 'seeker' | 'employer';

/**
 * Вакансия в том виде, в котором её отдаёт бэкенд.
 */
export interface Vacancy {
  /** Идентификатор вакансии. */
  id: number;
  /** Идентификатор работодателя. */
  employer_id: number;
  /** Название. */
  title: string;
  /** Описание. */
  description: string;
  /** Зарплата от. */
  salary_from: number;
  /** Зарплата до. */
  salary_to: number;
  /** Дата публикации в формате ISO 8601. */
  created_at: string;
}

/**
 * Почта и пароль из форм входа и регистрации.
 */
interface Credentials {
  /** Почта. */
  email: string;
  /** Пароль. */
  password: string;
}

/**
 * Возвращает текст ошибки для пользователя по HTTP-статусу.
 * @param status HTTP-статус ответа, 0 — сервер недоступен.
 * @returns Текст ошибки.
 */
function getStatusMessage(status: number): string {
  if (status >= 500) {
    return 'Ошибка сервера, попробуйте позже';
  }

  return STATUS_MESSAGES[status] ?? 'Не удалось выполнить запрос';
}

/**
 * Ошибка запроса к API. В `message` — текст для пользователя.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  /**
   * @param status HTTP-статус ответа, 0 — сервер недоступен.
   * @param body Тело ответа сервера.
   */
  constructor(status: number, body: unknown = null) {
    super(getStatusMessage(status));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Читает тело ответа: JSON, если он разбирается, иначе текст.
 * @param response Ответ сервера.
 * @returns Тело ответа или `null`, если оно пустое.
 */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

/**
 * Достаёт поле из разобранного тела ответа.
 * @param body Тело ответа.
 * @param key Название поля.
 * @returns Значение поля или `undefined`, если тело — не объект или поля в нём нет.
 */
function getField(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
}

/**
 * Отправляет запрос к API вместе с cookie сессии и разбирает ответ.
 * @param method HTTP-метод.
 * @param path Путь относительно `API_URL`, например `/login`.
 * @param options Настройки запроса.
 * @param options.body Тело запроса, отправляется как JSON.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Содержимое поля `data` из ответа или `null`, если его нет.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой; в `body` — текст из поля `error`.
 */
async function request(method: string, path: string, { body, signal }: { body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
  const init: RequestInit = { method, credentials: 'include', signal };

  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  let data: unknown;

  try {
    response = await fetch(`${API_URL}${path}`, init);
    data = await readBody(response);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    throw new ApiError(0);
  }

  // Бэкенд оборачивает ответы: { "data": ... } при успехе и { "error": "..." } при ошибке.
  if (!response.ok) {
    throw new ApiError(response.status, getField(data, 'error') ?? data);
  }

  return getField(data, 'data') ?? null;
}

/**
 * Регистрирует пользователя; сессию бэкенд сохраняет в cookie.
 * @param data Данные формы.
 * @param data.email Почта.
 * @param data.password Пароль.
 * @param data.role Роль.
 * @throws {ApiError} 409 — почта уже занята, 400 — роль некорректна, 422 — почта или пароль не прошли проверку.
 */
export async function register({ email, password, role }: Credentials & { role: UserRole }): Promise<void> {
  try {
    await request('POST', '/register', { body: { email, password, role } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      error.message = 'Аккаунт с таким email уже существует';
    }

    throw error;
  }

  setAuthorized(true);
}

/**
 * Входит в аккаунт; сессию бэкенд сохраняет в cookie.
 * @param data Данные формы.
 * @param data.email Почта.
 * @param data.password Пароль.
 * @throws {ApiError} 401 — неверная почта или пароль, 422 — пароль не подходит под правила бэкенда,
 * то есть тоже заведомо неверный; в обоих случаях текст ошибки одинаковый.
 */
export async function login({ email, password }: Credentials): Promise<void> {
  try {
    await request('POST', '/login', { body: { email, password } });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 422)) {
      error.message = 'Неверная электронная почта или пароль';
    }

    throw error;
  }

  setAuthorized(true);
}

/**
 * Выходит из аккаунта: cookie сессии может удалить только бэкенд.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой.
 */
export async function logout(): Promise<void> {
  await request('POST', '/logout');
  setAuthorized(false);
}

/**
 * Выполняет запрос и сообщает, удался ли он; ответ и ошибка не важны.
 * @param method HTTP-метод.
 * @param path Путь относительно `API_URL`.
 * @returns `true`, если сервер ответил успехом.
 */
async function succeeds(method: string, path: string): Promise<boolean> {
  try {
    await request(method, path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Проверяет по cookie, вошёл ли пользователь.
 * Сначала проверяется access-токен запросом `GET /me`, и только если бэкенд ответил 401 —
 * сессия продлевается по refresh-токену. Так вход не сбрасывается, когда access-токен ещё действует,
 * а refresh-токен уже нет.
 */
export async function restoreSession(): Promise<void> {
  try {
    await request('GET', '/me');
    setAuthorized(true);
  } catch (error) {
    setAuthorized(error instanceof ApiError && error.status === 401 && (await succeeds('POST', '/refresh')));
  }
}

/**
 * Загружает ленту вакансий.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Вакансии; пустой массив, если их нет.
 * @throws {ApiError} Сервер недоступен, ответил ошибкой или прислал не список.
 */
export async function getVacancies({ signal }: { signal?: AbortSignal } = {}): Promise<Vacancy[]> {
  const vacancies = (await request('GET', '/vacancies', { signal })) ?? [];

  if (!Array.isArray(vacancies)) {
    throw new ApiError(500, vacancies);
  }

  return vacancies;
}
