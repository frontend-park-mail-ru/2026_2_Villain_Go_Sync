import { ApiError, getRuntimeConfig } from './api';
import { getCurrentUser, onSessionChange, setCurrentUser } from './session';

const REFRESH_INTERVAL = 15_000;
const REQUEST_TIMEOUT = 10_000;

interface RuntimeConfig {
  maxVacancyCategories: number;
  vacancyCreationEnabled: boolean;
  applicationsEnabled: boolean;
}

type RuntimeFlag = 'vacancyCreationEnabled' | 'applicationsEnabled';

const defaults: Readonly<RuntimeConfig> = {
  maxVacancyCategories: 5,
  vacancyCreationEnabled: true,
  applicationsEnabled: true,
};

export const VACANCY_CREATION_DISABLED = 'Создание вакансий временно недоступно';
export const APPLICATIONS_DISABLED = 'Отклики временно недоступны';

let config: Readonly<RuntimeConfig> = defaults;
let revision = 0;
const listeners = new Set<() => void>();

/**
 * Возвращает настройки для активной сессии или значения по умолчанию.
 * @returns Текущие настройки.
 */
export function currentRuntimeConfig(): Readonly<RuntimeConfig> {
  return config;
}

/**
 * Подписывает компонент на обновления до его закрытия.
 * @param listener Обновление элементов интерфейса.
 * @param signal Сигнал завершения жизни компонента.
 */
export function onRuntimeConfigChange(listener: () => void, signal: AbortSignal): void {
  if (signal.aborted) { return; }
  listeners.add(listener);
  signal.addEventListener('abort', () => { listeners.delete(listener); }, { once: true });
}

/**
 * Обновляет настройки и сообщает об изменившихся значениях.
 * @param next Новые настройки.
 */
function publish(next: Readonly<RuntimeConfig>): void {
  const same = config.maxVacancyCategories === next.maxVacancyCategories
    && config.vacancyCreationEnabled === next.vacancyCreationEnabled
    && config.applicationsEnabled === next.applicationsEnabled;
  config = next;
  if (same) { return; }
  for (const listener of listeners) { listener(); }
}

/**
 * Применяет отказ backend сразу. Старые ответы опроса больше не актуальны.
 * @param flag Функция, отключённая сервером.
 */
export function reportDisabledFeature(flag: RuntimeFlag): void {
  if (!getCurrentUser()) { return; }
  revision += 1;
  publish({ ...config, [flag]: false });
}

/**
 * Проверяет полный ответ перед заменой последнего снимка.
 * @param data Поле data из API.
 * @returns Настройки из валидного ответа.
 * @throws {TypeError} Ответ не соответствует контракту.
 */
function readConfig(data: unknown): RuntimeConfig {
  const { configs, flags } = (data ?? {}) as { configs?: Record<string, unknown>; flags?: Record<string, unknown> };
  const max = configs?.['vacancy.max_categories'];
  const create = flags?.['vacancy.creation_enabled'];
  const apply = flags?.['application.applications_enabled'];
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 100
    || typeof create !== 'boolean' || typeof apply !== 'boolean') {
    throw new TypeError('Некорректный runtime-config');
  }
  return { maxVacancyCategories: max, vacancyCreationEnabled: create, applicationsEnabled: apply };
}

/** Запускает обновление настроек для каждой новой сессии. */
export function startRuntimeConfig(): void {
  let controller: AbortController | undefined;
  let timer: number | undefined;

  const restart = (): void => {
    controller?.abort();
    window.clearInterval(timer);
    publish(defaults);
    if (!getCurrentUser()) { return; }

    controller = new AbortController();
    const { signal } = controller;
    let pending = false;
    const refresh = async (): Promise<void> => {
      if (pending || signal.aborted) { return; }
      pending = true;
      const startedAt = revision;
      try {
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT)]);
        const next = readConfig(await getRuntimeConfig(requestSignal));
        if (!requestSignal.aborted && revision === startedAt) { publish(next); }
      } catch (error) {
        if (!signal.aborted && error instanceof ApiError && error.status === 401) { setCurrentUser(null); }
        // При временной ошибке настройки текущей сессии остаются в памяти.
      } finally {
        pending = false;
      }
    };

    timer = window.setInterval(() => { void refresh(); }, REFRESH_INTERVAL);
    void refresh();
  };
  onSessionChange(restart);
  restart();
}
