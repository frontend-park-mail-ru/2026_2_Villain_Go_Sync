import { ApiError, getEmployer, getSeeker, getVacancies, profileImageURL, type Employer, type Seeker, type UserRole } from '../api';
import { experienceRecords, experienceSummary, preferredWork, seekerContacts } from '../components/career-view';
import { getProfileInitials, mountImage } from '../components/profile-images';
import { conditions, workLabel } from '../components/work-options';
import { isProfileComplete } from '../profile-required';
import { formatSalary } from '@hirenoon/format';
import { getWebsiteHref } from '@hirenoon/validation';
import type { Page, PageProps } from '../router';
import jobsTemplate from './ProfileJobs.hbs';
import template from './PublicProfilePage.hbs';

/** Профиль компании или соискателя в режиме просмотра. */
class PublicProfilePage implements Page {
  #abortController = new AbortController();
  #container!: HTMLElement;

  /**
   * @param id Идентификатор просматриваемого пользователя.
   * @param role Роль владельца профиля.
   */
  constructor(private readonly id: number, private readonly role: UserRole) {}

  /**
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    this.#container = container;
    const { signal } = this.#abortController;
    container.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'retry') { void this.#load(); }
      if (action === 'retry-jobs') {
        const jobs = this.#container.querySelector<HTMLElement>('[data-company-jobs]');
        if (jobs) { void this.#loadJobs(jobs); }
      }
    }, { signal });
    void this.#load();
  }

  /** Отменяет загрузку при уходе со страницы. */
  destroy(): void { this.#abortController.abort(); }

  /** Загружает публичные данные владельца. */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;
    const isCompany = this.role === 'employer';
    const heading = isCompany ? 'Профиль компании' : 'Профиль соискателя';
    const subtitle = isCompany ? 'Информация о работодателе, команде и условиях работы' : 'Опыт, навыки и контакты кандидата';
    const page = { heading, subtitle, isCompany };
    if (!Number.isSafeInteger(this.id) || this.id <= 0) {
      this.#container.innerHTML = template({ ...page, notFound: true });
      return;
    }

    this.#container.innerHTML = template({ ...page, isLoading: true });
    try {
      const profile = await (isCompany ? getEmployer(this.id, { signal }) : getSeeker(this.id, { signal }));
      if (signal.aborted) { return; }
      if (!isProfileComplete(profile, this.id, this.role)) {
        this.#container.innerHTML = template({ ...page, notFound: true });
        return;
      }
      const details = isCompany ? this.#companyDetails(profile as Employer) : this.#seekerDetails(profile as Seeker);
      this.#container.innerHTML = template({ ...page, ...details });
      const avatar = this.#container.querySelector<HTMLElement>('.profile__avatar')!;
      mountImage(avatar, profileImageURL(details.image), details.initials);
      const jobs = this.#container.querySelector<HTMLElement>('[data-company-jobs]');
      if (jobs) { void this.#loadJobs(jobs); }
    } catch (error) {
      if (signal.aborted) { return; }
      const notFound = error instanceof ApiError && error.status === 404;
      this.#container.innerHTML = template({ ...page, notFound, error: (error as Error).message });
    }
  }

  /**
   * @param company Публичный профиль компании.
   * @returns Сведения для карточек компании.
   */
  #companyDetails(company: Employer) {
    return {
      name: company.company_name,
      image: company.logo_url,
      initials: getProfileInitials(company.company_name),
      meta: [company.industry, company.main_city, company.team_size].filter(Boolean).join(' · '),
      contacts: [
        { label: 'Сайт', value: company.website, href: getWebsiteHref(company.website ?? '') },
        { label: 'Контактная почта', value: company.hiring_email },
        { label: 'Адрес офиса', value: company.office_address },
      ].filter(({ value }) => value?.trim()),
      sections: [
        { title: 'О компании', subtitle: 'Миссия, деятельность и специализация', text: company.description },
        { title: 'Направления и технологии', subtitle: 'Чем занимается команда', tags: company.technologies },
        { title: 'Команда и культура', subtitle: 'Подходы к работе и ценности', records: company.culture?.map((record) => ({
          title: record.title, caption: record.short_description, text: record.description,
        })) },
        { title: 'Условия и преимущества', subtitle: 'Что получают сотрудники', text: company.benefits },
      ],
    };
  }

  /**
   * @param seeker Публичный профиль соискателя.
   * @returns Сведения для карточек соискателя.
   */
  #seekerDetails(seeker: Seeker) {
    return {
      name: [seeker.first_name, seeker.last_name].filter(Boolean).join(' '),
      image: seeker.avatar_url,
      initials: getProfileInitials(seeker.first_name, seeker.last_name),
      meta: [seeker.city, experienceSummary(seeker.experience_items), workLabel('work_format', seeker.work_format)].filter(Boolean).join(' · '),
      contacts: seekerContacts(seeker),
      sections: [
        { title: 'О себе', subtitle: 'Краткое представление и профессиональные интересы', text: seeker.description },
        { title: 'Желаемая работа', subtitle: 'Предпочтения кандидата по работе', values: preferredWork(seeker) },
        { title: 'Опыт работы', subtitle: 'Предыдущие места работы и опыт кандидата', records: experienceRecords(seeker.experience_items) },
        { title: 'Образование и курсы', subtitle: 'Образование и дополнительное обучение', records: seeker.education_items?.map((record) => ({
          title: record.institution, caption: [record.specialization, record.completion_year].filter(Boolean).join(' · '), text: record.record_type,
        })) },
        { title: 'Навыки', subtitle: 'Профессиональные компетенции', tags: seeker.skills },
        { title: 'Портфолио и проекты', subtitle: 'Проекты и выполненные задачи кандидата', records: seeker.projects?.map((record) => ({
          title: [record.title, record.url].filter(Boolean).join(' · '),
          href: typeof record.url === 'string' ? getWebsiteHref(record.url) : null,
          text: record.description,
        })) },
      ],
    };
  }

  /**
   * Загружает первые две вакансии компании из публичного каталога.
   * @param jobs Карточка открытых вакансий.
   */
  async #loadJobs(jobs: HTMLElement): Promise<void> {
    const { signal } = this.#abortController;
    jobs.innerHTML = jobsTemplate({ publicView: true, loading: true });
    try {
      const vacancies = await getVacancies({ signal, employerId: this.id });
      if (signal.aborted) { return; }
      jobs.innerHTML = jobsTemplate({
        publicView: true,
        companyPath: `/?employer_id=${this.id}`,
        vacancies: vacancies.slice(0, 2).map((item) => ({
          id: item.id, title: item.title, conditions: conditions(item),
          salary: formatSalary(item.salary_from, item.salary_to, item.currency),
        })),
      });
    } catch {
      if (!signal.aborted) { jobs.innerHTML = jobsTemplate({ publicView: true, error: true }); }
    }
  }
}

/** Публичный профиль работодателя. */
export class CompanyProfilePage extends PublicProfilePage {
  /**
   * @param props Параметры маршрута.
   * @param props.params Идентификатор компании.
   */
  constructor({ params }: PageProps) { super(Number(params.id), 'employer'); }
}

/** Публичный профиль соискателя для работодателя. */
export class SeekerProfilePage extends PublicProfilePage {
  /**
   * @param props Параметры маршрута.
   * @param props.params Идентификатор соискателя.
   */
  constructor({ params }: PageProps) { super(Number(params.id), 'seeker'); }
}
