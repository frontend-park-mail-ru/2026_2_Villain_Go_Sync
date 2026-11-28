import { ApiError, getEmployerApplicants, getResume, getSeeker, profileImageURL, type Applicant, type Resume, type Seeker } from '../api';
import { openApplicantPreview } from '../components/ApplicantPreview';
import { applicationStatuses } from '../components/application-status';
import { experienceRecords, experienceSummary, seekerContacts } from '../components/career-view';
import { getProfileInitials, mountImage } from '../components/profile-images';
import { isProfileForUser } from '../profile-required';
import type { Page, PageProps } from '../router';
import { getCurrentUser, onSessionChange } from '../session';
import template from './ApplicantPage.hbs';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const notePrefix = 'hirenoon:application-note:';

/**
 * @param value Дата из API.
 * @returns День и месяц или пустая строка для неизвестной даты.
 */
function displayDate(value?: string | null): string {
  const date = Date.parse(value ?? '');
  return Number.isNaN(date) ? '' : dateFormat.format(date);
}

/** Подробный отклик на вакансию текущего работодателя. */
export default class ApplicantPage implements Page {
  #id: number;
  #abortController = new AbortController();
  #container!: HTMLElement;
  #applicant: Applicant | null = null;
  #seeker: Seeker | null = null;
  #contactsUnavailable = false;
  #resume: Resume | null = null;
  #noteKey: string | null;
  #note = '';
  #noteDraft = '';
  #editingNote = false;

  /**
   * @param props Параметры маршрута.
   * @param props.params Идентификатор отклика.
   */
  constructor({ params }: PageProps) {
    this.#id = Number(params.id);
    const user = getCurrentUser();
    this.#noteKey = user?.id && user.role === 'employer' ? `${notePrefix}${user.id}:${this.#id}` : null;
  }

  /** @param container Контейнер страницы. */
  render(container: HTMLElement): void {
    this.#container = container;
    const { signal } = this.#abortController;
    container.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-action]');
      if (target?.dataset.action === 'retry') { void this.#load(); }
      if (target?.dataset.action === 'stage') { this.#openStage(target.dataset.stage); }
      if (target?.dataset.action === 'edit-note') { this.#toggleNote(true); }
      if (target?.dataset.action === 'cancel-note') { this.#toggleNote(false); }
    }, { signal });
    container.addEventListener('input', (event) => {
      const field = event.target;
      if (field instanceof HTMLTextAreaElement && field.name === 'note') { this.#noteDraft = field.value; }
    }, { signal });
    container.addEventListener('submit', (event) => {
      if (!(event.target instanceof HTMLFormElement) || !event.target.matches('[data-note-form]')) { return; }
      event.preventDefault();
      this.#saveNote(event.target);
    }, { signal });
    void this.#load();
  }

  /** Отменяет запросы при уходе со страницы. */
  destroy(): void { this.#abortController.abort(); }

  /** @returns Есть ли несохранённый текст заметки. */
  hasUnsavedChanges(): boolean { return this.#editingNote && this.#noteDraft.trim() !== this.#note; }

  /** Находит отклик в выдаче текущего работодателя и загружает его данные. */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;
    if (!Number.isSafeInteger(this.#id) || this.#id <= 0) {
      this.#container.innerHTML = template({ notFound: true });
      return;
    }
    this.#container.innerHTML = template({ isLoading: true });
    try {
      const applicants = await getEmployerApplicants({ signal });
      if (signal.aborted) { return; }
      const applicant = applicants.find((item) => item.application_id === this.#id);
      if (!applicant) {
        this.#container.innerHTML = template({ notFound: true });
        return;
      }
      const [seeker, resume] = await Promise.allSettled([
        applicant.seeker_id > 0 ? getSeeker(applicant.seeker_id, { signal }) : null,
        applicant.resume_id ? getResume(applicant.resume_id, { signal }) : null,
      ]);
      if (signal.aborted) { return; }
      this.#applicant = applicant;
      this.#seeker = seeker.status === 'fulfilled' && isProfileForUser(seeker.value, applicant.seeker_id) ? seeker.value : null;
      this.#contactsUnavailable = seeker.status === 'rejected' && !(seeker.reason instanceof ApiError && seeker.reason.status === 404);
      this.#resume = resume.status === 'fulfilled' && resume.value?.seeker_id === applicant.seeker_id ? resume.value : null;
      this.#note = this.#readNote();
      this.#renderApplicant();
    } catch (error) {
      if (signal.aborted) { return; }
      const notFound = error instanceof ApiError && [403, 404].includes(error.status);
      this.#container.innerHTML = template({ notFound, error: (error as Error).message });
    }
  }

  /** Рисует данные отклика и последнее изменение этапа, полученное из API. */
  #renderApplicant(): void {
    const applicant = this.#applicant!;
    const seeker = this.#seeker;
    const resume = this.#resume;
    const name = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Кандидат';
    const initials = getProfileInitials(applicant.first_name, applicant.last_name);
    const date = displayDate(applicant.applied_at);
    const status = applicationStatuses[applicant.status];
    const stageDate = displayDate(applicant.status_changed_at);
    const experience = resume?.experience_items?.length ? resume.experience_items : seeker?.experience_items;
    this.#container.innerHTML = template({
      applicant, name, date, status: status?.label ?? 'Неизвестный статус',
      meta: [resume?.target_position || seeker?.preferred_position, resume?.city || seeker?.city, experienceSummary(experience)].filter(Boolean).join(' · '),
      historyEvent: stageDate && status?.event ? { date: stageDate, text: status.event } : null,
      experience: experienceRecords(experience), experienceText: resume?.experience,
      skills: resume?.skills?.length ? resume.skills : seeker?.skills,
      contacts: seekerContacts(seeker), contactsUnavailable: this.#contactsUnavailable,
      seekerPath: seeker ? `/seekers/${applicant.seeker_id}` : null,
      resumePath: resume ? `/resumes/${applicant.resume_id}` : null,
      isInterview: applicant.status === 'interview', isRejected: applicant.status === 'rejected',
      note: this.#note, noteDraft: this.#noteDraft, editingNote: this.#editingNote,
    });
    const avatar = this.#container.querySelector<HTMLElement>('.profile__avatar')!;
    mountImage(avatar, profileImageURL(applicant.avatar_url || seeker?.avatar_url), initials);
  }

  /**
   * Открывает подтверждение перехода на выбранный этап.
   * @param stage Этап из кнопки действия.
   */
  #openStage(stage?: string): void {
    if (!this.#applicant || (stage !== 'interview' && stage !== 'rejected')) { return; }
    openApplicantPreview(this.#container, this.#applicant, {
      date: '',
      status: '',
      actionTitle: stage === 'interview' ? 'Перевести на собеседование' : 'Отказать кандидату',
    }, this.#abortController.signal, () => this.#renderApplicant(), stage);
  }

  /** @returns Внутренняя заметка из текущей вкладки. */
  #readNote(): string {
    try { return this.#noteKey ? sessionStorage.getItem(this.#noteKey) ?? '' : ''; }
    catch { return ''; }
  }

  /**
   * Открывает или закрывает форму заметки.
   * @param editing Показывать поле ввода.
   */
  #toggleNote(editing: boolean): void {
    this.#editingNote = editing;
    this.#noteDraft = this.#note;
    const form = this.#container.querySelector<HTMLFormElement>('[data-note-form]')!;
    const text = this.#container.querySelector<HTMLElement>('[data-note-text]')!;
    const edit = this.#container.querySelector<HTMLButtonElement>('[data-action="edit-note"]')!;
    const field = form.elements.namedItem('note') as HTMLTextAreaElement;
    form.hidden = !editing;
    text.hidden = editing;
    edit.hidden = editing;
    field.value = this.#noteDraft;
    form.querySelector('[role=alert]')!.textContent = '';
    (editing ? field : edit).focus();
  }

  /**
   * Сохраняет заметку для этого отклика и аккаунта в текущей вкладке.
   * @param form Форма заметки.
   */
  #saveNote(form: HTMLFormElement): void {
    const note = this.#noteDraft.trim();
    try {
      if (!this.#noteKey) { throw new Error(); }
      if (note) { sessionStorage.setItem(this.#noteKey, note); }
      else { sessionStorage.removeItem(this.#noteKey); }
      this.#note = note;
      this.#container.querySelector('[data-note-text]')!.textContent = note || 'Заметка не добавлена';
      this.#toggleNote(false);
    } catch {
      form.querySelector('[role=alert]')!.textContent = 'Не удалось сохранить заметку в этой вкладке';
    }
  }
}

onSessionChange(() => {
  if (getCurrentUser() !== null) { return; }
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(notePrefix)) { sessionStorage.removeItem(key); }
    }
  } catch { /* Выход доступен при отключённом хранилище. */ }
});
