import { workLabel } from './work-options';
import type { DetailRecord, Seeker } from '../api';

const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = new Intl.PluralRules('ru');

interface ProfileRecord {
  title: string;
  caption?: string;
  text?: string;
  href?: string | null;
}

/**
 * @param value Дата в ответе API.
 * @returns Месяц и год или пустая строка при отсутствии даты.
 */
function formatMonth(value: DetailRecord[string] | undefined): string {
  const date = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(date) ? '' : monthFormat.format(date).replace(/\sг\.$/, '');
}

/**
 * @param records Записи об опыте работы из API.
 * @returns Подписи, периоды и обязанности для просмотра.
 */
export function experienceRecords(records?: DetailRecord[] | null): ProfileRecord[] {
  return (records ?? []).map((record) => ({
    title: [record.position_title, record.company_name].filter(Boolean).join(' · '),
    caption: [formatMonth(record.started_on), record.is_current ? 'настоящее время' : formatMonth(record.ended_on)].filter(Boolean).join(' — '),
    text: String(record.achievements ?? ''),
  })).filter(({ title, caption, text }) => title || caption || text);
}

/**
 * Считает месяцы работы, объединяя пересекающиеся периоды.
 * @param records Записи об опыте работы из API.
 * @returns Стаж для краткой подписи профиля.
 */
export function experienceSummary(records?: DetailRecord[] | null): string {
  const monthIndex = (date: Date): number => date.getUTCFullYear() * 12 + date.getUTCMonth();
  const now = monthIndex(new Date());
  const periods = (records ?? []).map(({ started_on, ended_on, is_current }) => ({
    start: monthIndex(new Date(String(started_on))),
    end: is_current ? now : Math.min(monthIndex(new Date(String(ended_on))), now),
  })).filter(({ start, end }) => Number.isFinite(start) && end > start).sort((first, second) => first.start - second.start);
  let months = 0;
  let lastEnd = -Infinity;
  for (const { start, end } of periods) {
    months += Math.max(0, end - Math.max(start, lastEnd));
    lastEnd = Math.max(lastEnd, end);
  }
  const years = Math.floor(months / 12);
  const yearWord = { one: 'год', few: 'года', many: 'лет', other: 'лет', zero: 'лет', two: 'года' }[plural.select(years)];
  const parts = [years ? `${years} ${yearWord}` : '', months % 12 ? `${months % 12} мес.` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') + ' опыта' : '';
}

/**
 * @param seeker Публичные данные соискателя.
 * @returns Должность, города и формат для блока «Желаемая работа».
 */
export function preferredWork(seeker: Seeker): { label: string; value: string }[] {
  return [
    { label: 'Желаемая должность', value: seeker.preferred_position ?? '' },
    { label: 'Желаемые города', value: seeker.preferred_cities ?? '' },
    { label: 'Формат работы', value: workLabel('work_format', seeker.work_format) },
  ].filter(({ value }) => value.trim());
}

/**
 * @param seeker Данные профиля соискателя, если профиль доступен.
 * @returns Только контакты для связи с кандидатом.
 */
export function seekerContacts(seeker?: Seeker | null): { label: string; value: string }[] {
  return [
    { label: 'Телефон', value: seeker?.phone?.trim() || 'Не указан' },
    { label: 'Контактная почта', value: seeker?.contact_email?.trim() || 'Не указана' },
    { label: 'Мессенджер', value: seeker?.messenger?.trim() || 'Не указан' },
  ];
}
