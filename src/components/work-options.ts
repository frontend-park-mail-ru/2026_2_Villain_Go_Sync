import type { DetailRecord, WorkPreferences } from '../api';
/** Значения перечислений публичного API и их подписи в формах и карточках. */
export const workOptions: Record<string, Record<string, string>> = {
  work_format: { remote: 'Удалённо', hybrid: 'Гибрид', office: 'Офис' },
  employment_type: { full: 'Полная', part: 'Частичная' },
  work_schedule: { '5_2': '5/2', '2_2': '2/2', flexible: 'Гибкий', shift: 'Сменный' },
  experience_level: { no_experience: 'Без опыта', '1_3': '1–3 года', '3_6': '3–6 лет', '6_plus': 'Более 6 лет' },
};

/**
 * @param kind Название перечисления.
 * @param value Значение из API.
 * @returns Русская подпись.
 */
export function workLabel(kind: string, value?: string | null): string {
  return value ? workOptions[kind]?.[value] ?? value : '';
}

/**
 * @param records Записи API.
 * @returns Текст записей для просмотра профиля и резюме.
 */
export function recordText(records?: DetailRecord[]): string {
  return (records ?? []).map((record) => Object.values(record).filter((v) => v !== false && v !== null && v !== '')
    .map((v) => v === true ? 'По настоящее время' : v).join(' · ')).join('\n');
}


/**
 * @param row Условия работы.
 * @returns Строка условий из заполненных полей.
 */
export function conditions(row: WorkPreferences): string {
  return [row.city, workLabel('work_format', row.work_format), workLabel('work_schedule', row.work_schedule),
    workLabel('employment_type', row.employment_type)].filter(Boolean).join(' · ');
}
