import { workOptions } from './work-options';
import template from './ListFilters.hbs';
import type { Resume, Vacancy } from '../api';

type ListKind = 'catalog' | 'vacancies' | 'resumes';

/** Фильтрация данных текущего списка до разбиения на страницы. */
export class ListFilters {
  #values = new URLSearchParams();
  #usageFilters: NodeListOf<HTMLInputElement> | null = null;
  #applicationCounts: Map<number, { total: number; fresh: number }> | null = null;

  /** @param counts Число откликов по каждому документу. */
  setApplicationCounts(counts: Map<number, { total: number; fresh: number }>): void {
    this.#applicationCounts = counts;
    this.#usageFilters?.forEach((input) => { input.disabled = false; });
  }

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
        ['work_format', 'Формат работы'], ['employment_type', 'Занятость'], ['work_schedule', 'График'], ['experience_level', 'Опыт'],
      ].map(([key, title]) => ({ key, title, options: Object.entries(workOptions[key]).map(([value, label]) => ({ value, label })) }))
        : [{ key: 'applications', title: resumes ? 'Использование в откликах' : 'Отклики',
          options: [{ value: 'with', label: resumes ? 'Есть отклики' : 'Есть новые' }, { value: 'without', label: 'Нет откликов' }] },
        ...(resumes ? [] : [{ key: 'deadline', title: 'Срок приёма', options: [{ value: 'soon', label: 'Скоро истекает' }, { value: 'none', label: 'Без дедлайна' }] }])],
      salary: kind === 'catalog', submit: resumes ? 'Показать резюме' : 'Показать вакансии',
    }));
    const dialog = container.querySelector<HTMLDialogElement>('.list-filters')!;
    const form = dialog.querySelector('form')!;
    this.#usageFilters = form.querySelectorAll<HTMLInputElement>('[name=applications]');
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name]');
    const to = form.querySelector<HTMLInputElement>('[name=to]');
    const syncRange = (): void => {
      if (to) { to.min = form.querySelector<HTMLInputElement>('[name=from]')!.value || '0'; }
    };
    button.addEventListener('click', () => {
      for (const field of fields) {
        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
          field.checked = this.#values.getAll(field.name).includes(field.value);
          field.disabled = field.name === 'applications' && !this.#applicationCounts;
        } else { field.value = this.#values.get(field.name) ?? (field.name === 'order' ? 'new' : ''); }
      }
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
        if (field.disabled || (field instanceof HTMLInputElement && field.type === 'checkbox' && !field.checked)) { continue; }
        if (field.value.trim() && field.value !== 'new') { this.#values.append(field.name, field.value.trim()); }
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
      for (const key of Object.keys(workOptions)) {
        const selected = this.#values.getAll(key);
        if (selected.length && !selected.includes(String((item as unknown as Record<string, unknown>)[key]))) { return false; }
      }
      const city = this.#values.get('city');
      if (city && !item.city?.toLowerCase().includes(city.toLowerCase())) { return false; }
      const usage = this.#values.getAll('applications');
      if (usage.length && this.#applicationCounts) {
        const counts = this.#applicationCounts.get(item.id);
        const matchesNew = usage.includes('with') && (('currency' in item ? counts?.fresh : counts?.total) ?? 0) > 0;
        if (!matchesNew && !(usage.includes('without') && !counts?.total)) { return false; }
      }
      const deadlines = this.#values.getAll('deadline');
      if (deadlines.length && 'currency' in item) {
        const remaining = item.apply_until ? Date.parse(item.apply_until + 'T23:59:59') - Date.now() : NaN;
        if (!(deadlines.includes('none') && !item.apply_until) && !(deadlines.includes('soon') && remaining >= 0 && remaining <= 7 * 86400000)) { return false; }
      }
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
