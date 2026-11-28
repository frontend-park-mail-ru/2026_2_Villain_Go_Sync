import { ApiError } from '../api';
import { parseKeys, sameKey, type OnlineConfKey } from './keys';

const storageKey = 'onlineconf.demo.keys.v1';
const demoKeys: OnlineConfKey[] = [
  {
    kind: 'config',
    scope: 'applications',
    name: 'cover_letter_max_length',
    description: 'Максимальная длина сопроводительного письма',
    value: 500,
  },
  {
    kind: 'flag',
    scope: 'applications',
    name: 'cover_letter_required',
    description: 'Обязательное письмо при отклике на вакансию',
    enabled: true,
    rollout: 20,
    included_users: [42],
    excluded_users: [87],
  },
  {
    kind: 'config',
    scope: 'frontend',
    name: 'vacancy_page_size',
    description: 'Количество вакансий на странице',
    value: 6,
  },
  {
    kind: 'flag',
    scope: 'frontend',
    name: 'show_salary_filter',
    description: 'Фильтр по зарплате в каталоге вакансий',
    enabled: true,
    rollout: 100,
  },
  {
    kind: 'config',
    scope: 'vacancies',
    name: 'employment_types',
    description: 'Доступные варианты занятости',
    value: ['full_time', 'part_time', 'project'],
  },
  {
    kind: 'config',
    scope: 'vacancies',
    name: 'posting_limits',
    description: 'Ограничения на публикацию вакансий',
    value: { max_active: 25, max_drafts: 10 },
  },
  {
    kind: 'flag',
    scope: 'applications',
    name: 'smart_resume_sort',
    description: 'Новый порядок сортировки резюме в откликах',
    enabled: false,
    rollout: 0,
  },
];

/**
 * Читает локальный каталог, используя примеры при первом открытии.
 * @returns Сохранённые демо-ключи или начальный набор.
 */
export function getDemoKeys(): OnlineConfKey[] {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === null) { return demoKeys; }
    const entries: unknown = JSON.parse(saved);
    if (!Array.isArray(entries)) { return demoKeys; }
    return parseKeys(entries.map((entry) => {
      if (entry?.kind === 'flag' && typeof entry.enabled === 'undefined') {
        return { ...entry, enabled: entry.rollout > 0 };
      }
      return entry;
    }));
  } catch {
    return demoKeys;
  }
}

/**
 * Сохраняет демо-ключ в браузере.
 * @param key Данные ключа.
 * @param edit Обновляется ли существующий ключ.
 * @returns Каталог после сохранения.
 * @throws {ApiError} Ключ с таким именем уже существует или отсутствует.
 */
export function saveDemoKey(key: OnlineConfKey, edit: boolean): OnlineConfKey[] {
  const keys = getDemoKeys();
  const index = keys.findIndex((entry) => sameKey(entry, key));
  if (edit && index === -1) { throw new ApiError(404); }
  if (!edit && index !== -1) { throw new ApiError(409); }

  const updated = edit ? keys.map((entry, position) => position === index ? key : entry) : [...keys, key];
  localStorage.setItem(storageKey, JSON.stringify(updated));
  return updated;
}
