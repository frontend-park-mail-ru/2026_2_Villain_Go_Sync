import { ApiError, applyToVacancy, isFeatureDisabledError, type Resume } from '../api';
import { APPLICATIONS_DISABLED, currentRuntimeConfig, onRuntimeConfigChange, reportDisabledFeature } from '../runtime-config';
import { setFieldError, setLoading } from './form';
import { getCoverLetterError } from '@hirenoon/validation';
import { hideToast, showToast } from './toast';
import template from './ApplicationDialog.hbs';

/**
 * Подбирает текст ошибки отправки отклика.
 * @param error Ошибка запроса.
 * @returns Текст для уведомления.
 */
function getApplyError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Вы уже откликались на эту вакансию с этим резюме';
  }

  return 'Не удалось отправить отклик. Попробуйте ещё раз';
}

/**
 * Показывает окно отклика: выбор резюме и сопроводительное письмо.
 * Если резюме нет, окно предлагает его создать.
 * @param vacancyId Идентификатор вакансии.
 * @param resumes Резюме вошедшего соискателя.
 * @param signal Сигнал ухода со страницы вакансии.
 * @returns Обещание, которое выполняется после закрытия окна; `true`, если отклик отправлен.
 */
export function openApplicationDialog(vacancyId: number, resumes: Resume[], signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) { return Promise.resolve(false); }
  return new Promise((resolve) => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = template({ resumes, single: resumes.length === 1 ? resumes[0] : null });

    const dialog = wrapper.querySelector('dialog')!;
    const form = dialog.querySelector<HTMLFormElement>('.application');
    const button = form?.querySelector<HTMLButtonElement>('[type="submit"]');
    const notice = dialog.querySelector<HTMLElement>('[data-applications-notice]')!;
    const lifetime = new AbortController();
    let isSubmitting = false;
    let isClosed = false;

    const updateAvailability = (): void => {
      const enabled = currentRuntimeConfig().applicationsEnabled;
      if (button) { button.disabled = !enabled || isSubmitting; }
      notice.hidden = enabled;
      notice.textContent = enabled ? '' : APPLICATIONS_DISABLED;
    };
    onRuntimeConfigChange(updateAvailability, lifetime.signal);
    updateAvailability();

    dialog.addEventListener('click', (event) => {
      const target = event.target as Element;
      // Клик по самому <dialog> — это клик по затемнению вокруг окна.
      const result = target === dialog ? 'cancel' : target.closest<HTMLElement>('[data-result]')?.dataset.result;

      if (result && !isSubmitting) {
        dialog.close(result);
      }
    });

    // Пока отклик отправляется, Esc не закрывает окно.
    dialog.addEventListener('cancel', (event) => {
      if (isSubmitting) {
        event.preventDefault();
      }
    });

    const dismiss = (): void => dialog.close();
    signal.addEventListener('abort', dismiss, { once: true });
    dialog.addEventListener('close', () => {
      lifetime.abort();
      signal.removeEventListener('abort', dismiss);
      isClosed = true;
      dialog.remove();
      resolve(dialog.returnValue === 'sent');
    });

    form?.addEventListener('input', (event) => setFieldError(event.target as Element, ''));

    // Выбранное резюме убирает ошибку и возвращает подсказку.
    form?.addEventListener('change', () => {
      const group = form.querySelector('.application__group')!;
      const hint = group.querySelector<HTMLElement>('.application__hint')!;

      group.classList.remove('application__group_invalid');
      hint.textContent = hint.dataset.text ?? hint.textContent;
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (isSubmitting || !button || !currentRuntimeConfig().applicationsEnabled) {
        return;
      }

      const data = new FormData(form);
      const resumeId = Number(data.get('resume'));
      const letter = form.querySelector<HTMLTextAreaElement>('[name="coverLetter"]')!;
      const letterError = getCoverLetterError(letter.value);
      setFieldError(letter, letterError);
      if (letterError) { letter.focus(); return; }
      const group = form.querySelector('.application__group')!;
      const hint = group.querySelector<HTMLElement>('.application__hint')!;

      if (!resumeId) {
        hint.dataset.text ??= hint.textContent ?? '';
        hint.textContent = 'Выберите резюме';
        group.classList.add('application__group_invalid');
        group.querySelector<HTMLInputElement>('input')?.focus();
        return;
      }

      hideToast();
      isSubmitting = true;
      setLoading(button, true);
      updateAvailability();

      try {
        await applyToVacancy(vacancyId, { resumeId, coverLetter: String(data.get('coverLetter') ?? '').trim() });
      } catch (error) {
        if (!isClosed && !signal.aborted) {
          if (isFeatureDisabledError(error)) {
            reportDisabledFeature('applicationsEnabled');
            showToast(APPLICATIONS_DISABLED, 'error');
            return;
          }
          showToast(getApplyError(error), 'error');
          if (error instanceof ApiError && error.status === 409 && resumes.length === 1) { dialog.close('sent'); }
        }
        return;
      } finally {
        isSubmitting = false;
        setLoading(button, false);
        if (!isClosed) { updateAvailability(); }
      }

      if (!isClosed) { dialog.close('sent'); showToast('Отклик отправлен'); }
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}
