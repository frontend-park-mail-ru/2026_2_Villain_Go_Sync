import { setFieldError } from './form';
import { workOptions } from './work-options';
import rowTemplate from './record-fields.hbs';
import { hasVisibleText } from '@hirenoon/validation';
import type { DetailRecord } from '../api';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const sections: Record<string, { limit: number; fields: string[][] }> = {
  experience_items: { limit: 10, fields: [
    ['company_name', 'Компания'], ['position_title', 'Должность'], ['started_on', 'Начало работы', 'date'],
    ['ended_on', 'Окончание', 'date'], ['is_current', 'Работаю сейчас', 'checkbox'], ['achievements', 'Обязанности и достижения'],
  ] },
  education_items: { limit: 10, fields: [
    ['record_type', 'Тип записи'], ['institution', 'Учебное заведение или курс'],
    ['completion_year', 'Год завершения', 'number'], ['specialization', 'Специальность / направление'],
  ] },
  projects: { limit: 5, fields: [['title', 'Название проекта'], ['url', 'Ссылка', 'url'], ['description', 'Описание проекта']] },
  culture: { limit: 2, fields: [['title', 'Название'], ['short_description', 'Краткое описание'], ['description', 'Описание']] },
};

/**
 * Подключает повторяемые записи. Скрытое поле хранит массив и участвует в восстановлении черновика.
 * @param group Контейнер группы.
 */
function mountRecords(group: HTMLElement): void {
  const key = group.dataset.records!;
  const config = sections[key];
  const hidden = group.querySelector<HTMLInputElement>('input[type=hidden]')!;
  const rows = group.querySelector<HTMLElement>('[data-rows]')!;
  const add = group.querySelector<HTMLButtonElement>('[data-add-record]')!;
  const insert = (record: DetailRecord): void => {
    rows.insertAdjacentHTML('beforeend', rowTemplate({ fields: config.fields.map(([name, label, type]) => ({
      key: name, label, type: type || 'text', value: record[name], checked: record[name] === true,
    })) }));
    add.disabled = rows.childElementCount >= config.limit;
  };
  const sync = (): void => {
    const records = [...rows.children].map((row) => {
      const record: DetailRecord = {};
      for (const input of row.querySelectorAll<HTMLInputElement>('[data-record-field]')) {
        const name = input.dataset.recordField!;
        record[name] = input.type === 'checkbox' ? input.checked : input.value.trim() || null;
        if (input.type === 'number' && input.value) { record[name] = Number(input.value); }
      }
      return record;
    });
    hidden.value = JSON.stringify(records.filter((record) => Object.values(record).some(Boolean)));
    add.disabled = rows.childElementCount >= config.limit;
  };
  const render = (): void => {
    rows.replaceChildren();
    add.disabled = false;
    let saved: DetailRecord[] = [];
    try { saved = JSON.parse(hidden.value || '[]'); } catch { /* Пустой или устаревший черновик. */ }
    if (Array.isArray(saved)) { saved.filter((item) => item && typeof item === 'object').forEach(insert); }
  };
  hidden.addEventListener('change', render);
  render();
  group.addEventListener('input', sync);
  group.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('[data-add-record]') && rows.childElementCount < config.limit) {
      insert({});
      rows.lastElementChild?.querySelector('input')?.focus();
    } else if (target.closest('[data-remove-record]')) {
      target.closest('.editor__record')?.remove();
      sync();
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

/**
 * Заполняет дополнительные поля актуальными данными профиля или документа.
 * @param form Форма.
 * @param model Ответ API или пустая запись.
 */
export function mountEditorDetails(form: HTMLFormElement, model: object): void {
  const values = model as Record<string, unknown>;
  for (const field of form.querySelectorAll<Control>('[data-extra]')) {
    const value = values[field.name];
    if (field instanceof HTMLSelectElement && workOptions[field.name]) {
      for (const [code, label] of Object.entries(workOptions[field.name])) { field.add(new Option(label, code)); }
    }
    if (field.dataset.extra === 'names' && Array.isArray(value)) { field.value = value.map((item) => item.name).join(', '); }
    else if (field.dataset.extra === 'records') { field.value = JSON.stringify(value ?? []); }
    else if (value !== null && value !== undefined) { field.value = String(value); }
  }
  form.querySelectorAll<HTMLElement>('[data-records]').forEach(mountRecords);
}

/**
 * @param form Форма.
 * @returns Дополнительные поля в формате HTTP API.
 */
export function readEditorDetails(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of form.querySelectorAll<Control>('[data-extra]:enabled')) {
    const value = field.value.trim();
    if (field.dataset.extra === 'records' || field.dataset.extra === 'ids') { data[field.name] = JSON.parse(value || '[]'); }
    else if (field.dataset.extra === 'names') {
      const names = value.split(/[,\n]/).map((name) => name.trim()).filter(Boolean);
      data[field.name] = [...new Map(names.map((name) => [name.toLowerCase(), { name }])).values()];
    } else { data[field.name] = field.type === 'number' ? (value ? Number(value) : null) : value; }
  }
  return data;
}

/**
 * @param field Элемент редактора.
 * @returns Ошибка заполнения или пустая строка.
 */
export function detailError(field: Control): string {
  if (field.required && !hasVisibleText(field.value)) { return 'Заполните обязательное поле'; }
  if (field.validity.badInput || field.validity.rangeUnderflow || field.validity.rangeOverflow || field.validity.stepMismatch) { return 'Проверьте числовое значение'; }
  if (field.validity.typeMismatch) { return field.type === 'email' ? 'Введите электронную почту' : 'Введите полный адрес ссылки'; }
  if (field.type === 'url' && field.value && !/^https?:\/\//i.test(field.value.trim())) { return 'Укажите ссылку с http:// или https://'; }
  const row = field.closest('.editor__record');
  if (!row) { return ''; }
  const name = (field as HTMLInputElement).dataset.recordField;
  const inputs = [...row.querySelectorAll<HTMLInputElement>('input')];
  const populated = inputs.some((item) => item.type === 'checkbox' ? item.checked : Boolean(item.value.trim()));
  if (populated && field.closest('[data-seeker-records]') && (name === 'company_name' || name === 'position_title') && !field.value.trim()) {
    return 'Заполните компанию и должность';
  }
  if (name === 'ended_on' && field.value) {
    const start = row.querySelector<HTMLInputElement>('[data-record-field=started_on]')?.value;
    if (row.querySelector<HTMLInputElement>('[data-record-field=is_current]')?.checked || (start && field.value < start)) {
      return 'Проверьте дату окончания работы';
    }
  }
  return '';
}

/**
 * @param form Форма документа.
 * @returns Валидны ли расширенные поля всех этапов.
 */
export function validateEditorDetails(form: HTMLFormElement): boolean {
  for (const field of form.querySelectorAll<Control>('[data-extra]:enabled, [data-record-field]')) {
    const error = detailError(field);
    setFieldError(field, error);
    if (!error) { continue; }
    const panel = field.closest<HTMLElement>('[data-panel]');
    if (panel?.hidden) {
      const index = [...form.querySelectorAll('[data-panel]')].indexOf(panel);
      form.querySelectorAll<HTMLButtonElement>('[data-step]')[index]?.click();
    }
    field.focus();
    return false;
  }
  return true;
}
