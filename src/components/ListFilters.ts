import template from './ListFilters.hbs';
import type { Resume, Vacancy } from '../api';

type ListKind = 'catalog' | 'vacancies' | 'resumes';

/** Фильтрация данных текущего списка до разбиения на страницы. */
export class ListFilters {
  #values = new URLSearchParams();

  /** @returns Применены ли ограничения к выдаче. */
  get active(): boolean { return this.#values.size > 0; }

  /** Убирает все ограничения выдачи. */
  reset(): void { this.#values = new URLSearchParams(); }

  /**
   * Подключает панель фильтров к кнопке страницы.
   * @param container Страница со списком.
   * @param kind Тип записей.
   * @param update Обновление выдачи.
   */
  mount(container: HTMLElement, kind: ListKind, update: () => void): void {
    const button = container.querySelector<HTMLButtonElement>('[data-filters]')!;
    const resumes = kind === 'resumes';
    container.insertAdjacentHTML('beforeend', template({
      title: kind === 'catalog' ? 'Фильтры вакансий' : resumes ? 'Фильтры моих резюме' : 'Фильтры моих вакансий',
      resumes,
      groups: kind === 'catalog' ? [
        { title: 'Формат работы', options: ['Удалённо', 'Гибрид', 'Офис'] },
        { title: 'Занятость', options: ['Полная', 'Частичная'] },
        { title: 'График', options: ['5/2', 'Гибкий', 'Сменный'] },
        { title: 'Опыт', options: ['1–3 года', 'Без опыта', '3–6 лет'] },
      ] : resumes ? [
        { title: 'Статус', options: ['Опубликовано', 'Черновик'] },
        { title: 'Использование в откликах', options: ['Есть отклики', 'Без откликов'] },
      ] : [
        { title: 'Статус', options: ['Опубликована', 'Черновик'] },
        { title: 'Отклики', options: ['Есть новые', 'Нет откликов'] },
        { title: 'Срок приёма', options: ['Скоро истекает', 'Без дедлайна'] },
      ],
      salary: kind === 'catalog', submit: resumes ? 'Показать резюме' : 'Показать вакансии',
    }));
    const dialog = container.querySelector<HTMLDialogElement>('.list-filters')!;
    const form = dialog.querySelector('form')!;
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name]');
    const to = form.querySelector<HTMLInputElement>('[name=to]');
    const syncRange = (): void => {
      if (to) { to.min = form.querySelector<HTMLInputElement>('[name=from]')!.value || '0'; }
    };
    button.addEventListener('click', () => {
      for (const field of fields) { field.value = this.#values.get(field.name) ?? (field.name === 'order' ? 'new' : ''); }
      syncRange();
      dialog.showModal();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || (event.target as Element).closest('[data-close]')) { dialog.close(); }
    });
    form.addEventListener('input', syncRange);
    form.addEventListener('reset', () => { this.reset(); dialog.close(); update(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.reset();
      for (const field of fields) {
        if (field.value && field.value !== 'new') { this.#values.set(field.name, field.value); }
      }
      dialog.close();
      update();
    });
  }

  /**
   * Применяет диапазон зарплаты, период и сортировку.
   * @param records Найденные записи.
   * @param owner Сортировать собственные записи по дате.
   * @returns Отфильтрованный список.
   */
  apply<T extends Resume | Vacancy>(records: T[], owner = false): T[] {
    const from = this.#values.get('from');
    const to = this.#values.get('to');
    const days = Number(this.#values.get('days'));
    const date = (item: T): number => Date.parse(('updated_at' in item && item.updated_at) || item.created_at) || 0;
    const result = records.filter((item) => {
      if (days && date(item) < Date.now() - days * 86400000) { return false; }
      if ((!from && !to) || !('currency' in item)) { return true; }
      if (item.currency !== 'RUB' || (typeof item.salary_from !== 'number' && typeof item.salary_to !== 'number')) { return false; }
      return (!from || typeof item.salary_to !== 'number' || item.salary_to >= Number(from))
        && (!to || typeof item.salary_from !== 'number' || item.salary_from <= Number(to));
    });
    if (owner) {
      const order = this.#values.get('order');
      result.sort((a, b) => order === 'title' ? a.title.localeCompare(b.title, 'ru') : (date(b) - date(a)) * (order === 'old' ? -1 : 1));
    }
    return result;
  }
}
