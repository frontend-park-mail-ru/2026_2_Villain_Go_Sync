import { ApiError, applyToVacancy, type Resume } from '../api';
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
 * @returns Обещание, которое выполняется после закрытия окна; `true`, если отклик отправлен.
 */
export function openApplicationDialog(vacancyId: number, resumes: Resume[]): Promise<boolean> {
  return new Promise((resolve) => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = template({ resumes, single: resumes.length === 1 ? resumes[0] : null });

    const dialog = wrapper.querySelector('dialog')!;
    const form = dialog.querySelector<HTMLFormElement>('.application');
    let isSubmitting = false;
    let isClosed = false;

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

    dialog.addEventListener('close', () => {
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

      if (isSubmitting) {
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

      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!;

      hideToast();
      isSubmitting = true;
      setLoading(button, true);

      try {
        await applyToVacancy(vacancyId, { resumeId, coverLetter: String(data.get('coverLetter') ?? '').trim() });
      } catch (error) {
        if (!isClosed) { showToast(getApplyError(error), 'error'); }
        return;
      } finally {
        isSubmitting = false;
        setLoading(button, false);
      }

      if (!isClosed) { dialog.close('sent'); showToast('Отклик отправлен'); }
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}
