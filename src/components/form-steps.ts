import { detailError } from './editor-details';
import { saveCreationDraft } from './creation-draft';
import { setFieldError } from './form';
import { showToast } from './toast';

type TextControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Подключает шаги формы, проверку текущего шага и живой предпросмотр.
 * @param form Форма документа.
 * @param validate Проверка одного поля.
 * @param draftOptions Путь черновика и обработчик успешного сохранения.
 * @param draftOptions.path Страница формы.
 * @param draftOptions.onSaved Обновление состояния формы после сохранения.
 */
export function mountFormSteps(
  form: HTMLFormElement,
  validate: (control: TextControl) => string,
  draftOptions?: { path: string; onSaved: () => void },
): void {
  const panels = [...form.querySelectorAll<HTMLElement>('[data-panel]')];
  const steps = [...form.querySelectorAll<HTMLButtonElement>('[data-step]')];
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const back = form.querySelector<HTMLButtonElement>('[data-back]')!;
  const draft = form.querySelector<HTMLButtonElement>('[data-draft]');
  const description = form.querySelector<HTMLElement>('[data-instructions]')!;
  const finalLabel = submit.textContent!.trim();
  let current = 0;

  const preview = (): void => {
    for (const item of form.querySelectorAll<HTMLElement>('[data-value]')) {
      const field = form.elements.namedItem(item.dataset.value!) as TextControl | null;
      const label = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.textContent : field?.value.trim();
      const value = label || item.dataset.empty || '—';
      // Полный текст остаётся в поле. Карточке предпросмотра достаточно нескольких строк.
      item.textContent = item.closest('.editor__preview') ? value.slice(0, 500) : value;
    }
  };
  const display = (index: number): void => {
    current = index;
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
    steps.forEach((step, i) => {
      step.setAttribute('aria-current', i === index ? 'step' : 'false');
      step.querySelector('small')!.textContent = i < index ? 'Завершён' : i === index ? 'Текущий этап' : 'Предстоит';
      step.querySelector('b')!.textContent = i < index ? '✓' : String(i + 1);
    });
    back.hidden = index === 0;
    description.textContent = panels[index].dataset.instructions!;
    submit.textContent = index === panels.length - 1 ? finalLabel : 'Далее →';
    preview();
  };
  const go = (target: number): void => {
    for (let i = current; i < target; i++) {
      for (const field of panels[i].querySelectorAll<TextControl>('input[name]:enabled, input[data-record-field], textarea[name]:enabled, select[name]:enabled')) {
        const error = field.hasAttribute('data-extra') || field.hasAttribute('data-record-field') ? detailError(field) : validate(field);
        setFieldError(field, error);
        if (error) { display(i); field.focus(); return; }
      }
    }
    display(target);
    panels[target].focus({ preventScroll: true });
    form.scrollIntoView({ block: 'start' });
  };
  steps.forEach((step, i) => step.addEventListener('click', () => go(i)));
  back.addEventListener('click', () => go(current - 1));
  form.addEventListener('submit', (event) => {
    if (current === panels.length - 1) { return; }
    event.preventDefault();
    event.stopPropagation();
    go(current + 1);
  });
  form.addEventListener('input', preview);
  if (draft && draftOptions) {
    draft.addEventListener('click', () => {
      const saved = saveCreationDraft(draftOptions.path, form);
      if (saved) { draftOptions.onSaved(); }
      showToast(saved ? 'Черновик сохранён в этой вкладке' : 'Не удалось сохранить черновик', saved ? 'success' : 'error');
    });
  }
  display(0);
}
