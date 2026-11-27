import { changeApplicationStatus, getResume, type Applicant } from '../api';
import { mountCardImages } from './profile-images';
import template from './ApplicantPreview.hbs';

/**
 * Показывает отклик поверх текущего списка и подгружает описание приложенного резюме.
 * @param container Контейнер страницы.
 * @param applicant Данные отклика.
 * @param details Подписи даты и текущего этапа.
 * @param details.date Дата получения отклика.
 * @param details.status Текущий этап.
 * @param details.actionTitle Заголовок подтверждения действия на странице отклика.
 * @param signal Сигнал ухода со страницы откликов.
 * @param refresh Обновляет доску после подтверждения сервером.
 * @param nextStage Этап целевой колонки при перетаскивании.
 */
export function openApplicantPreview(
  container: HTMLElement,
  applicant: Applicant,
  details: { date: string; status: string; actionTitle?: string },
  signal: AbortSignal,
  refresh: () => void,
  nextStage?: string,
): void {
  const initials = [applicant.first_name, applicant.last_name].map((part) => part.trim().charAt(0)).join('');
  container.insertAdjacentHTML('beforeend', template({ ...applicant, ...details, initials }));
  const dialog = container.querySelector<HTMLDialogElement>('.candidate-preview')!;
  const controller = new AbortController();
  mountCardImages(dialog);
  const dismiss = (): void => dialog.close();
  signal.addEventListener('abort', dismiss, { once: true });
  dialog.addEventListener('close', () => {
    signal.removeEventListener('abort', dismiss);
    controller.abort();
    dialog.remove();
  }, { once: true });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || (event.target as Element).closest('.modal__close, a')) { dialog.close(); }
  });
  const form = dialog.querySelector('form')!;
  const stage = form.elements.namedItem('status') as HTMLSelectElement;
  const reason = form.elements.namedItem('reason') as HTMLSelectElement;
  const comment = form.elements.namedItem('comment') as HTMLTextAreaElement;
  const submit = form.querySelector('button')!;
  stage.value = nextStage ?? applicant.status;
  reason.value = applicant.reason_code ?? '';
  comment.value = details.actionTitle ? '' : applicant.status_comment ?? '';
  const updateReason = (): void => {
    reason.required = stage.value === 'rejected';
    reason.disabled = !reason.required;
    form.querySelector<HTMLElement>('[data-rejection]')!.hidden = !reason.required;
  };
  stage.addEventListener('change', updateReason);
  updateReason();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) { return; }
    submit.disabled = true;
    try {
      const saved = await changeApplicationStatus(applicant.application_id, { status: stage.value,
        ...(reason.required ? { reason_code: reason.value } : {}), comment: comment.value.trim() });
      if (signal.aborted) { return; }
      Object.assign(applicant, saved);
      if (dialog.open) { dialog.close(); }
      refresh();
    } catch (error) {
      form.querySelector('[role=alert]')!.textContent = (error as Error).message || 'Не удалось изменить этап';
    } finally { submit.disabled = false; }
  });
  dialog.showModal();
  if (details.actionTitle || !applicant.resume_id) { return; }
  getResume(applicant.resume_id, { signal: controller.signal }).then((resume) => {
    if (dialog.isConnected) {
      dialog.querySelector('[data-resume-summary]')!.textContent = resume?.experience || resume?.description || '';
    }
  }).catch(() => { /* Название резюме и ссылка уже доступны. */ });
}
