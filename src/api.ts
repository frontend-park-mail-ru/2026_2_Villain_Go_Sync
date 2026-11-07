import { API_URL } from './config';
import { setCurrentUser, type SessionUser } from './session';

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Не удалось связаться с сервером',
  400: 'Некорректный запрос',
  401: 'Нужно войти в аккаунт',
  403: 'Недостаточно прав',
  404: 'Не найдено',
  409: 'Такие данные уже существуют',
  422: 'Проверьте правильность заполнения полей',
};

export type UserRole = 'seeker' | 'employer';

export type Currency = 'RUB' | 'USD' | 'EUR';

/**
 * Поля вакансии, которые заполняет работодатель.
 */
export interface VacancyFields {
  /** Название. */
  title: string;
  /** Описание. */
  description: string;
  /** Зарплата от; `null`, если не указана. */
  salary_from: number | null;
  /** Зарплата до; `null`, если не указана. */
  salary_to: number | null;
  /** Валюта зарплаты. */
  currency: Currency;
}

/**
 * Вакансия в том виде, в котором её отдаёт бэкенд.
 */
export interface Vacancy extends VacancyFields {
  /** Идентификатор вакансии. */
  id: number;
  /** Идентификатор работодателя. */
  employer_id: number;
  /** Название компании. */
  company_name: string;
  /** Дата публикации в формате ISO 8601. */
  created_at: string;
}

/**
 * Текстовые поля резюме, которые заполняет соискатель.
 */
export interface ResumeFields {
  /** Название, например желаемая должность. */
  title: string;
  /** Описание навыков и интересов. */
  description: string;
  /** Опыт работы. */
  experience: string;
  /** Образование. */
  education: string;
}

/**
 * Резюме в том виде, в котором его отдаёт бэкенд.
 */
export interface Resume extends ResumeFields {
  /** Идентификатор резюме. */
  id: number;
  /** Идентификатор соискателя. */
  seeker_id: number;
  /** Дата создания в формате ISO 8601. */
  created_at: string;
  /** Дата последнего изменения в формате ISO 8601. */
  updated_at: string;
}

/**
 * Профиль компании.
 */
export interface Employer {
  /** Путь логотипа относительно адреса API. */
  logo_url?: string | null;
  /** Название компании. */
  company_name: string;
  /** Описание компании. */
  description: string;
  /** Сайт компании. */
  website: string;
}

/**
 * Профиль соискателя.
 */
export interface Seeker {
  /** Путь фотографии относительно адреса API. */
  avatar_url?: string | null;
  /** Имя. */
  first_name: string;
  /** Фамилия. */
  last_name: string;
  /** Телефон. */
  phone: string;
  /** Рассказ о себе. */
  description: string;
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

// На эти запросы 401 означает неверные данные или отсутствие сессии, продлевать здесь нечего.
const NO_REFRESH_PATHS = ['/login', '/register', '/refresh', '/logout'];
const CSRF_EXEMPT_PATHS = ['/login', '/register', '/refresh'];
const CSRF_ERRORS = new Set(['csrf token missing', 'csrf header missing', 'csrf token mismatch']);

let refreshing: Promise<boolean> | null = null;

/**
 * Продлевает сессию по refresh-токену. Если несколько запросов получили 401 одновременно,
 * они ждут одного и того же продления.
 * @returns `true`, если бэкенд выдал новый access-токен.
 */
function refreshSession(): Promise<boolean> {
  refreshing ??= request('POST', '/refresh', { canRefresh: false })
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

/**
 * Отправляет запрос к API вместе с cookie сессии и разбирает ответ.
 * Access-токен живёт недолго, поэтому на 401 сессия один раз продлевается и запрос повторяется;
 * если продлить не удалось, пользователь считается вышедшим.
 * @param method HTTP-метод.
 * @param path Путь относительно `API_URL`, например `/login`.
 * @param options Настройки запроса.
 * @param options.body Тело запроса, отправляется как JSON.
 * @param options.signal Сигнал для отмены запроса.
 * @param options.canRefresh Можно ли продлить сессию и повторить запрос при 401.
 * @param options.canRetryCsrf Можно ли обновить CSRF-cookie после отказа проверки токена.
 * @returns Содержимое поля `data` из ответа или `null`, если его нет.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой; в `body` — текст из поля `error`.
 */
async function request(
  method: string,
  path: string,
  {
    body,
    signal,
    canRefresh = !NO_REFRESH_PATHS.includes(path),
    canRetryCsrf = true,
  }: { body?: unknown; signal?: AbortSignal; canRefresh?: boolean; canRetryCsrf?: boolean } = {},
): Promise<unknown> {
  const init: RequestInit = { method, credentials: 'include', signal };
  const headers = new Headers();

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !CSRF_EXEMPT_PATHS.includes(path)) {
    const token = document.cookie.split(';').map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith('csrf_token='))?.slice('csrf_token='.length);

    if (token) {
      headers.set('X-CSRF-Token', token);
    }
  }

  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(body);
    }
  }
  init.headers = headers;

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

  if (response.status === 401 && canRefresh) {
    if (await refreshSession()) {
      return request(method, path, { body, signal, canRefresh: false, canRetryCsrf });
    }

    // Продлить не получилось — сессия закончилась, страницы для вошедших больше недоступны.
    setCurrentUser(null);
  }

  // CSRF проверяется до обработчика: отклонённый запрос ещё не изменил данные.
  if (response.status === 403 && canRetryCsrf && CSRF_ERRORS.has(String(getField(data, 'error')))) {
    if (await refreshSession()) {
      return request(method, path, { body, signal, canRefresh: false, canRetryCsrf: false });
    }
    setCurrentUser(null);
  }

  // Бэкенд оборачивает ответы: { "data": ... } при успехе и { "error": "..." } при ошибке.
  if (!response.ok) {
    throw new ApiError(response.status, getField(data, 'error') ?? data);
  }

  return getField(data, 'data') ?? null;
}

/**
 * Возвращает адрес изображения только с сервера API.
 * @param path Путь из ответа профиля.
 * @returns Абсолютный адрес или пустая строка.
 */
export function profileImageURL(path?: string | null): string {
  if (!path) { return ''; }
  const base = new URL(API_URL, window.location.origin);
  const url = new URL(path, base);
  return url.origin === base.origin && /^https?:$/.test(url.protocol) ? url.href : '';
}

/**
 * Загружает или удаляет изображение собственного профиля.
 * @param role Роль владельца.
 * @param file Изображение; `null` для удаления.
 */
export async function saveProfileImage(role: UserRole, file: File | null): Promise<void> {
  const field = role === 'employer' ? 'logo' : 'avatar';
  if (file) {
    const body = new FormData();
    body.append(field, file);
    await request('PUT', `/me/${field}`, { body });
  } else {
    await request('DELETE', `/me/${field}`);
  }
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
      error.message = 'Аккаунт с такой электронной почтой уже существует';
    }

    throw error;
  }

  await loadCurrentUser();
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

  await loadCurrentUser();
}

/**
 * Выходит из аккаунта: cookie сессии может удалить только бэкенд.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой.
 */
export async function logout(): Promise<void> {
  await request('POST', '/logout');
  setCurrentUser(null);
}

/**
 * Запрашивает у бэкенда, кто вошёл, и запоминает пользователя.
 * @throws {ApiError} Сессии нет или сервер ответил ошибкой.
 */
async function fetchCurrentUser(): Promise<void> {
  const data = await request('GET', '/me');
  const id = getField(data, 'id');
  const role = getField(data, 'role');

  const user: SessionUser = {
    id: typeof id === 'number' ? id : null,
    role: role === 'seeker' || role === 'employer' ? role : null,
  };

  setCurrentUser(user);
}

/**
 * Запоминает пользователя сразу после входа или регистрации. Если узнать данные не удалось,
 * пользователь всё равно считается вошедшим: cookie сессии бэкенд уже поставил.
 */
async function loadCurrentUser(): Promise<void> {
  try {
    await fetchCurrentUser();
  } catch {
    setCurrentUser({ id: null, role: null });
  }
}

/**
 * Проверяет по cookie, вошёл ли пользователь.
 * Сначала проверяется access-токен запросом `GET /me`; если бэкенд ответил 401, `request` сам продлевает
 * сессию по refresh-токену и повторяет запрос. Так вход не сбрасывается, когда access-токен ещё действует,
 * а refresh-токен уже нет.
 */
export async function restoreSession(): Promise<void> {
  try {
    await fetchCurrentUser();
  } catch {
    setCurrentUser(null);
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

/**
 * Загружает одну вакансию.
 * @param id Идентификатор вакансии.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Вакансия.
 * @throws {ApiError} 404 — вакансии нет; сервер недоступен или ответил ошибкой.
 */
export async function getVacancy(id: number, { signal }: { signal?: AbortSignal } = {}): Promise<Vacancy> {
  return toVacancy(await request('GET', `/vacancies/${id}`, { signal }));
}

/**
 * Проверяет, что бэкенд вернул вакансию, а не что-то другое.
 * @param data Содержимое поля `data` из ответа.
 * @returns Вакансия.
 * @throws {ApiError} Ответ не похож на вакансию.
 */
function toVacancy(data: unknown): Vacancy {
  if (typeof data !== 'object' || data === null) {
    throw new ApiError(500, data);
  }

  return data as Vacancy;
}

/**
 * Загружает вакансии вошедшего работодателя.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Вакансии; пустой массив, если их нет.
 * @throws {ApiError} 403 — пользователь не работодатель; сервер недоступен или ответил ошибкой.
 */
export async function getEmployerVacancies({ signal }: { signal?: AbortSignal } = {}): Promise<Vacancy[]> {
  const vacancies = (await request('GET', '/employer/vacancies', { signal })) ?? [];

  if (!Array.isArray(vacancies)) {
    throw new ApiError(500, vacancies);
  }

  return vacancies as Vacancy[];
}

/**
 * Создаёт вакансию; доступно работодателю с заполненным профилем компании.
 * @param fields Поля вакансии.
 * @returns Созданная вакансия.
 * @throws {ApiError} 403 — пользователь не работодатель или не заполнил профиль, 400 — поля не прошли проверку.
 */
export async function createVacancy(fields: VacancyFields): Promise<Vacancy> {
  return toVacancy(await request('POST', '/vacancies', { body: fields }));
}

/**
 * Сохраняет изменения в вакансии; доступно только её работодателю.
 * @param id Идентификатор вакансии.
 * @param fields Новые значения полей.
 * @returns Изменённая вакансия.
 * @throws {ApiError} 403 — вакансия чужая, 404 — вакансии нет, 400 — поля не прошли проверку.
 */
export async function updateVacancy(id: number, fields: VacancyFields): Promise<Vacancy> {
  return toVacancy(await request('PATCH', `/vacancies/${id}`, { body: fields }));
}

/**
 * Удаляет вакансию; доступно только её работодателю.
 * @param id Идентификатор вакансии.
 * @throws {ApiError} Нет прав, вакансии нет или сервер ответил ошибкой.
 */
export async function deleteVacancy(id: number): Promise<void> {
  await request('DELETE', `/vacancies/${id}`);
}

/**
 * Загружает публичный профиль компании.
 * @param id Идентификатор работодателя.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Профиль компании.
 * @throws {ApiError} 404 — профиль не заполнен; сервер недоступен или ответил ошибкой.
 */
export async function getEmployer(id: number, { signal }: { signal?: AbortSignal } = {}): Promise<Employer> {
  return (await request('GET', `/employers/${id}`, { signal })) as Employer;
}

/**
 * Проверяет, что бэкенд вернул резюме, а не что-то другое.
 * @param data Содержимое поля `data` из ответа.
 * @returns Резюме.
 * @throws {ApiError} Ответ не похож на резюме.
 */
function toResume(data: unknown): Resume {
  if (typeof data !== 'object' || data === null) {
    throw new ApiError(500, data);
  }

  return data as Resume;
}

/**
 * Загружает одно резюме.
 * @param id Идентификатор резюме.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Резюме.
 * @throws {ApiError} 404 — резюме нет; сервер недоступен или ответил ошибкой.
 */
export async function getResume(id: number, { signal }: { signal?: AbortSignal } = {}): Promise<Resume> {
  return toResume(await request('GET', `/resumes/${id}`, { signal }));
}

/**
 * Загружает все резюме соискателя.
 * @param seekerId Идентификатор соискателя.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Резюме; пустой массив, если их нет.
 * @throws {ApiError} Сервер недоступен или ответил ошибкой.
 */
export async function getSeekerResumes(seekerId: number, { signal }: { signal?: AbortSignal } = {}): Promise<Resume[]> {
  const resumes = await request('GET', `/resumes?seeker_id=${seekerId}`, { signal });

  // Если резюме нет, бэкенд присылает null вместо пустого массива.
  if (resumes === null) {
    return [];
  }

  if (!Array.isArray(resumes)) {
    throw new ApiError(500, resumes);
  }

  return resumes as Resume[];
}

/**
 * Создаёт резюме; доступно только соискателю.
 * @param fields Поля резюме.
 * @returns Созданное резюме.
 * @throws {ApiError} 403 — пользователь не соискатель, 422 — нет названия; сервер ответил ошибкой.
 */
export async function createResume(fields: ResumeFields): Promise<Resume> {
  return toResume(await request('POST', '/resumes', { body: fields }));
}

/**
 * Сохраняет изменения в резюме; доступно только его владельцу.
 * @param id Идентификатор резюме.
 * @param fields Новые значения полей.
 * @returns Изменённое резюме.
 * @throws {ApiError} 404 — резюме нет или оно чужое, 422 — нет названия; сервер ответил ошибкой.
 */
export async function updateResume(id: number, fields: ResumeFields): Promise<Resume> {
  return toResume(await request('PUT', `/resumes/${id}`, { body: fields }));
}

/**
 * Удаляет резюме; доступно только его владельцу.
 * @param id Идентификатор резюме.
 * @throws {ApiError} Нет прав, резюме нет или сервер ответил ошибкой.
 */
export async function deleteResume(id: number): Promise<void> {
  await request('DELETE', `/resumes/${id}`);
}

/**
 * Загружает профиль соискателя.
 * @param id Идентификатор соискателя.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Профиль.
 * @throws {ApiError} 404 — профиль ещё не заполнен; сервер недоступен или ответил ошибкой.
 */
export async function getSeeker(id: number, { signal }: { signal?: AbortSignal } = {}): Promise<Seeker> {
  return (await request('GET', `/seekers/${id}`, { signal })) as Seeker;
}

/**
 * Сохраняет профиль вошедшего соискателя; если его ещё нет, бэкенд его создаёт.
 * @param profile Поля профиля.
 * @throws {ApiError} 403 — пользователь не соискатель, 422 — нет имени; сервер ответил ошибкой.
 */
export async function saveSeekerProfile(profile: Seeker): Promise<void> {
  await request('PUT', '/profile/seeker', { body: profile });
}

/**
 * Сохраняет профиль компании вошедшего работодателя; если его ещё нет, бэкенд его создаёт.
 * @param profile Поля профиля.
 * @throws {ApiError} 403 — пользователь не работодатель, 422 — нет названия; сервер ответил ошибкой.
 */
export async function saveEmployerProfile(profile: Employer): Promise<void> {
  await request('PUT', '/profile/employer', { body: profile });
}

/**
 * Откликается на вакансию от имени вошедшего соискателя.
 * @param vacancyId Идентификатор вакансии.
 * @param application Отклик.
 * @param application.resumeId Идентификатор резюме, с которым соискатель откликается.
 * @param application.coverLetter Сопроводительное письмо; пустая строка — без письма.
 * @throws {ApiError} 409 — с этим резюме уже откликались, 403 — пользователь не соискатель или резюме чужое.
 */
export async function applyToVacancy(
  vacancyId: number,
  { resumeId, coverLetter }: { resumeId: number; coverLetter: string },
): Promise<void> {
  await request('POST', `/vacancies/${vacancyId}/applications`, {
    body: { resume_id: resumeId, cover_letter: coverLetter || null },
  });
}

/**
 * Отклик на вакансию в том виде, в котором его видит работодатель.
 */
export interface Applicant {
  /** Идентификатор отклика. */
  application_id: number;
  /** Идентификатор вакансии. */
  vacancy_id: number;
  /** Название вакансии на момент отклика. */
  vacancy_title: string;
  /** Идентификатор соискателя. */
  seeker_id: number;
  /** Идентификатор приложенного резюме. */
  resume_id: number;
  /** Сопроводительное письмо. */
  cover_letter: string | null;
  /** Имя соискателя. */
  first_name: string;
  /** Фамилия соискателя. */
  last_name: string;
  /** Статус отклика: `pending`, `created`, `viewed`, `interview`, `accepted` или `rejected`. */
  status: string;
  /** Дата отклика в формате ISO 8601. */
  applied_at: string;
  /** Название резюме, с которым откликнулись. */
  resume_title: string;
}

/**
 * Загружает отклики на вакансию; доступно только её работодателю.
 * @param options Настройки запроса.
 * @param options.signal Сигнал для отмены запроса.
 * @returns Отклики; пустой массив, если их нет.
 * @throws {ApiError} 403 — вакансия чужая; сервер недоступен или ответил ошибкой.
 */
export async function getEmployerApplicants(
  { signal }: { signal?: AbortSignal } = {},
): Promise<Applicant[]> {
  // Если откликов нет, бэкенд присылает null вместо пустого массива.
  const applicants = (await request('GET', '/employer/applications', { signal })) ?? [];

  if (!Array.isArray(applicants)) {
    throw new ApiError(500, applicants);
  }

  return applicants as Applicant[];
}
