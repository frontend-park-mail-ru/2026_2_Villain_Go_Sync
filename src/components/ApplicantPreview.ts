import { getResume, type Applicant } from '../api';
import { mountCardImages } from './profile-images';
import template from './ApplicantPreview.hbs';

/**
 * Показывает отклик поверх текущего списка и подгружает описание приложенного резюме.
 * @param container Контейнер страницы.
 * @param applicant Данные отклика.
 * @param details Подписи даты и текущего этапа.
 * @param details.date Дата получения отклика.
 * @param details.status Текущий этап.
 * @param signal Сигнал ухода со страницы откликов.
 */
export function openApplicantPreview(container: HTMLElement, applicant: Applicant, details: { date: string; status: string }, signal: AbortSignal): void {
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
  dialog.showModal();
  getResume(applicant.resume_id, { signal: controller.signal }).then((resume) => {
    if (dialog.isConnected) {
      dialog.querySelector('[data-resume-summary]')!.textContent = resume?.experience || resume?.description || '';
    }
  }).catch(() => { /* Название резюме и ссылка уже доступны. */ });
}
