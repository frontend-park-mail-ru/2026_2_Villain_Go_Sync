const HOUR_MS = 60 * 60 * 1000;
const HOURS_IN_DAY = 24;
const MAX_RELATIVE_DAYS = 30;

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const hoursFormat = new Intl.RelativeTimeFormat('ru', { numeric: 'always' });
const daysFormat = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

/**
 * Форматирует вилку зарплаты.
 * @param {number} from Зарплата от; 0, если не указана.
 * @param {number} to Зарплата до; 0, если не указана.
 * @returns {string} Например, `220 000 – 300 000 ₽`, `от 220 000 ₽` или `Зарплата не указана`.
 */
export function formatSalary(from, to) {
  if (from > 0 && to > 0 && from !== to) {
    return `${numberFormat.format(from)} – ${numberFormat.format(to)} ₽`;
  }

  if (from > 0 && to > 0) {
    return `${numberFormat.format(from)} ₽`;
  }

  if (from > 0) {
    return `от ${numberFormat.format(from)} ₽`;
  }

  if (to > 0) {
    return `до ${numberFormat.format(to)} ₽`;
  }

  return 'Зарплата не указана';
}

/**
 * Описывает, как давно опубликована вакансия.
 * @param {string} isoDate Дата публикации в формате ISO 8601.
 * @returns {string} Например, `Опубликовано 2 часа назад`; пустая строка, если дата некорректна.
 */
export function formatPublished(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hours = Math.floor((Date.now() - date) / HOUR_MS);
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
