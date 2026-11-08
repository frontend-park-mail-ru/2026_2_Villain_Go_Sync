const HOUR_MS = 60 * 60 * 1000;
const HOURS_IN_DAY = 24;
const MAX_RELATIVE_DAYS = 30;

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const CURRENCY_SIGNS: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€' };
const hoursFormat = new Intl.RelativeTimeFormat('ru', { numeric: 'always' });
const daysFormat = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

/**
 * Форматирует вилку зарплаты.
 * @param from Зарплата от; `null`, если не указана.
 * @param to Зарплата до; `null`, если не указана.
 * @param currency Код валюты: RUB, USD или EUR; без него — рубли.
 * @returns Например, `220 000 – 300 000 ₽`, `От 220 000 ₽` или `Зарплата не указана`.
 */
export function formatSalary(from: number | null, to: number | null, currency = 'RUB'): string {
  from ??= null;
  to ??= null;

  const sign = CURRENCY_SIGNS[currency] ?? currency;

  if (from !== null && to !== null && from !== to) {
    return `${numberFormat.format(from)} – ${numberFormat.format(to)} ${sign}`;
  }

  if (from !== null && to !== null) {
    return `${numberFormat.format(from)} ${sign}`;
  }

  if (from !== null) {
    return `От ${numberFormat.format(from)} ${sign}`;
  }

  if (to !== null) {
    return `До ${numberFormat.format(to)} ${sign}`;
  }

  return 'Зарплата не указана';
}

/**
 * Описывает, как давно опубликована вакансия.
 * @param isoDate Дата публикации в формате ISO 8601.
 * @returns Например, `Опубликовано 2 часа назад`; пустая строка, если дата некорректна.
 */
export function formatPublished(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hours = Math.floor((Date.now() - date.getTime()) / HOUR_MS);
  const days = Math.floor(hours / HOURS_IN_DAY);

  if (hours < 1) {
    return 'Опубликовано только что';
  }

  if (hours < HOURS_IN_DAY) {
    return `Опубликовано ${hoursFormat.format(-hours, 'hour')}`;
  }

  if (days <= MAX_RELATIVE_DAYS) {
    return `Опубликовано ${daysFormat.format(-days, 'day')}`;
  }

  return `Опубликовано ${date.toLocaleDateString('ru-RU')}`;
}
