import template from './Pagination.hbs';

/**
 * Кнопка пагинации.
 */
interface PaginationItem {
  /** Текст на кнопке. */
  label?: string;
  /** Номер страницы, на которую ведёт кнопка. */
  page?: number;
  /** Описание кнопки для скринридера. */
  ariaLabel?: string;
  /** Текущая ли это страница. */
  isActive?: boolean;
  /** Недоступна ли кнопка. */
  isDisabled?: boolean;
  /** Многоточие на месте пропущенных страниц. */
  isGap?: boolean;
}

/**
 * Собирает кнопки пагинации: стрелки, первую и последнюю страницы и соседей текущей.
 * @param current Текущая страница, начиная с 1.
 * @param total Всего страниц.
 * @returns Кнопки по порядку, например `← 1 2 3 … 8 →`.
 */
function getPaginationItems(current: number, total: number): PaginationItem[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);

  // У краёв показываем три страницы подряд, чтобы ряд не менял ширину при переходах.
  if (current <= 2) {
    pages.add(3);
  }

  if (current >= total - 1) {
    pages.add(total - 2);
  }

  const visiblePages = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items: PaginationItem[] = [
    { label: '←', page: current - 1, ariaLabel: 'Предыдущая страница', isDisabled: current === 1 },
  ];

  visiblePages.forEach((page, index) => {
    const previous = visiblePages[index - 1];

    if (previous !== undefined && page - previous === 2) {
      items.push({ label: String(page - 1), page: page - 1, ariaLabel: `Страница ${page - 1}` });
    } else if (previous !== undefined && page - previous > 2) {
      items.push({ isGap: true });
    }

    items.push({ label: String(page), page, ariaLabel: `Страница ${page}`, isActive: page === current });
  });

  items.push({ label: '→', page: current + 1, ariaLabel: 'Следующая страница', isDisabled: current === total });

  return items;
}

/**
 * Возвращает разметку пагинации; на кнопках страниц — атрибут `data-page`.
 * @param current Текущая страница, начиная с 1.
 * @param total Всего страниц.
 * @returns HTML пагинации или пустая строка, если страница одна.
 */
export function renderPagination(current: number, total: number): string {
  return total > 1 ? template({ items: getPaginationItems(current, total) }) : '';
}
