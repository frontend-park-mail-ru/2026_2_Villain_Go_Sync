import { API_URL } from './config.js';

const STATUS_MESSAGES = {
  0: 'Не удалось связаться с сервером',
  400: 'Некорректный запрос',
  401: 'Нужно войти в аккаунт',
  403: 'Недостаточно прав',
  404: 'Не найдено',
  422: 'Проверьте правильность заполнения полей',
};

/**
 * @typedef {'seeker' | 'employer'} UserRole
 */

/**
 * @typedef {object} User
 * @property {number} id Идентификатор пользователя.
 * @property {string} email Почта.
 * @property {UserRole} role Роль: соискатель или работодатель.
 * @property {string} created_at Дата регистрации в формате ISO 8601.
 */

/**
 * @typedef {object} Vacancy
 * @property {number} id Идентификатор вакансии.
 * @property {number} employer_id Идентификатор работодателя.
 * @property {string} title Название.
 * @property {string} description Описание.
 * @property {number} salary_from Зарплата от.
 * @property {number} salary_to Зарплата до.
 * @property {string} created_at Дата публикации в формате ISO 8601.
 */

/**
 * Возвращает текст ошибки для пользователя по HTTP-статусу.
 * @param {number} status HTTP-статус ответа, 0 — сервер недоступен.
 * @returns {string} Текст ошибки.
 */
function getStatusMessage(status) {
  if (status >= 500) {
    return 'Ошибка сервера, попробуйте позже';
  }

  return STATUS_MESSAGES[status] ?? 'Не удалось выполнить запрос';
}

/**
 * Ошибка запроса к API. В `message` — текст для пользователя.
 */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP-статус ответа, 0 — сервер недоступен.
   * @param {unknown} [body] Тело ответа сервера.
   */
  constructor(status, body = null) {
    super(getStatusMessage(status));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Читает тело ответа: JSON, если он разбирается, иначе текст.
 * @param {Response} response Ответ сервера.
 * @returns {Promise<unknown>} Тело ответа или `null`, если оно пустое.
 */
async function readBody(response) {
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
 * Отправляет запрос к API вместе с cookie сессии и разбирает ответ.
 * @param {string} method HTTP-метод.
 * @param {string} path Путь относительно `API_URL`, например `/login`.
 * @param {object} [options] Настройки запроса.
 * @param {object} [options.body] Тело запроса, отправляется как JSON.
 * @param {AbortSignal} [options.signal] Сигнал для отмены запроса.
 * @returns {Promise<unknown>} Тело ответа.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой.
 */
async function request(method, path, { body, signal } = {}) {
  const init = { method, credentials: 'include', signal };

  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response;
  let data;

  try {
    response = await fetch(`${API_URL}${path}`, init);
    data = await readBody(response);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    throw new ApiError(0);
  }

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data;
}

/**
 * Регистрирует пользователя; сессию бэкенд сохраняет в cookie.
 * @param {object} data Данные формы.
 * @param {string} data.email Почта.
 * @param {string} data.password Пароль.
 * @param {UserRole} data.role Роль.
 * @throws {ApiError} 400 — почта уже занята, 422 — почта или пароль не прошли проверку.
 */
export async function register({ email, password, role }) {
  await request('POST', '/register', { body: { email, password, role } });
}

/**
 * Входит в аккаунт; сессию бэкенд сохраняет в cookie.
 * @param {object} data Данные формы.
 * @param {string} data.email Почта.
 * @param {string} data.password Пароль.
 * @throws {ApiError} 401 — неверная почта или пароль, 422 — почта или пароль не прошли проверку.
 */
export async function login({ email, password }) {
  await request('POST', '/login', { body: { email, password } });
}

/**
 * Выходит из аккаунта; бэкенд удаляет cookie сессии.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой.
 */
export async function logout() {
  await request('POST', '/logout');
}

/**
 * Узнаёт по cookie сессии, кто вошёл.
 * @param {object} [options] Настройки запроса.
 * @param {AbortSignal} [options.signal] Сигнал для отмены запроса.
 * @returns {Promise<User | null>} Пользователь или `null`, если сессии нет.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой, кроме 401.
 */
export async function getCurrentUser({ signal } = {}) {
  try {
    return await request('GET', '/me', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

/**
 * Загружает ленту вакансий.
 * @param {object} [options] Настройки запроса.
 * @param {AbortSignal} [options.signal] Сигнал для отмены запроса.
 * @returns {Promise<Vacancy[]>} Вакансии; пустой массив, если их нет.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой.
 */
export async function getVacancies({ signal } = {}) {
  return (await request('GET', '/vacancies', { signal })) ?? [];
}
