import { recordText, workLabel } from '../components/work-options';
import jobsTemplate from './ProfileJobs.hbs';
import { formatSalary } from '@hirenoon/format';
import { mountImage } from '../components/profile-images';
import { ApiError, getEmployerVacancies, profileImageURL, getEmployer, getSeeker, type Employer, type Seeker } from '../api';
import type { Page } from '../router';
import { getCurrentUser } from '../session';
import { isProfileComplete } from '../profile-required';
import { getWebsiteHref } from '@hirenoon/validation';
import template from './ProfilePage.hbs';

const SKELETON_FIELDS = 2;

/**
 * Собирает инициалы для заглушки вместо фото.
 * @param words Имя и фамилия или название компании.
 * @returns Не больше двух заглавных букв.
 */
function getInitials(...words: string[]): string {
  return words
    .flatMap((word) => word.trim().split(/\s+/))
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/**
 * Страница профиля вошедшего пользователя: соискателя или компании.
 */
export default class ProfilePage implements Page {
  #abortController = new AbortController();
  #container!: HTMLElement;

  /**
   * Рисует страницу в контейнер и загружает профиль.
   * @param container Контейнер страницы.
   */
  render(container: HTMLElement): void {
    this.#container = container;

    // Контейнер общий для всех страниц, поэтому обработчик снимается в destroy через signal.
    container.addEventListener(
      'click',
      (event) => {
        if ((event.target as Element).closest('[data-action="retry"]')) {
          this.#load();
        }
      },
      { signal: this.#abortController.signal },
    );

    this.#load();
  }

  /**
   * Вызывается при уходе со страницы: отменяет загрузку.
   */
  destroy(): void {
    this.#abortController.abort();
  }

  /**
   * Загружает профиль и показывает его или предложение заполнить.
   */
  async #load(): Promise<void> {
    const { signal } = this.#abortController;
    const user = getCurrentUser();
    const isCompany = user?.role === 'employer';
    const heading = isCompany ? 'Профиль компании' : 'Мой профиль';

    if (!user || user.id === null || user.role === null) {
      this.#container.innerHTML = template({ heading, isCompany, error: 'Не удалось узнать, кто вошёл в аккаунт', canRetry: false });
      return;
    }

    this.#container.innerHTML = template({
      heading,
      isCompany,
      isLoading: true,
      skeletonFields: Array.from({ length: SKELETON_FIELDS }),
    });

    let profile: Seeker | Employer | null;

    try {
      profile = isCompany ? await getEmployer(user.id, { signal }) : await getSeeker(user.id, { signal });
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      // 404 — профиль ещё не заполняли.
      if (!(error instanceof ApiError && error.status === 404)) {
        this.#container.innerHTML = template({ heading, isCompany, error: (error as Error).message, canRetry: true });
        return;
      }

      profile = null;
    }

    if (!isProfileComplete(profile, user.id, user.role)) { profile = null; }
    const imageUrl = profileImageURL(isCompany ? (profile as Employer | null)?.logo_url : (profile as Seeker | null)?.avatar_url);
    const description = this.#describe(profile, isCompany);
    const employer = isCompany ? profile as Employer | null : null;
    const seeker = isCompany ? null : profile as Seeker | null;
    const sections = isCompany ? [
      { title: 'Направления и технологии', text: employer?.technologies?.map((v) => v.name).join(' · ') },
      { title: 'Команда и культура', text: recordText(employer?.culture) },
      { title: 'Условия и преимущества', text: employer?.benefits },
    ] : [
      { title: 'Желаемая работа', text: [seeker?.preferred_position, seeker?.preferred_cities, workLabel('work_format', seeker?.work_format)].filter(Boolean).join(' · ') },
      { title: 'Опыт работы', text: recordText(seeker?.experience_items) },
      { title: 'Образование и курсы', text: recordText(seeker?.education_items) },
      { title: 'Навыки', text: seeker?.skills?.map((v) => v.name).join(' · ') },
      { title: 'Портфолио и проекты', text: recordText(seeker?.projects) },
    ];
    const info = isCompany ? [employer?.industry, employer?.main_city, employer?.team_size].filter(Boolean).join(' · ') : seeker?.city;
    const contacts = isCompany ? [{ label: 'Контактная почта', value: employer?.hiring_email }, { label: 'Адрес офиса', value: employer?.office_address }]
      : [{ label: 'Контактная почта', value: seeker?.contact_email }, { label: 'Мессенджер', value: seeker?.messenger }];
    this.#container.innerHTML = template({ heading, isCompany, sections, info, contacts, ...description });
    const avatar = this.#container.querySelector<HTMLElement>('.profile__avatar');
    if (avatar) { mountImage(avatar, imageUrl, description.initials ? String(description.initials) : { role: user.role }); }
    const jobs = this.#container.querySelector<HTMLElement>('[data-company-jobs]');
    if (jobs) {
      try {
        const vacancies = await getEmployerVacancies({ signal });
        if (signal.aborted) { return; }
        jobs.innerHTML = jobsTemplate({ vacancies: vacancies.slice(0, 2).map((item) => ({
          id: item.id, title: item.title, salary: formatSalary(item.salary_from, item.salary_to, item.currency),
        })) });
        jobs.hidden = false;
      } catch { /* Профиль остаётся доступен и при ошибке загрузки вакансий. */ }
    }
  }

  /**
   * Готовит данные профиля для шаблона.
   * @param profile Профиль или `null`, если его ещё не заполняли.
   * @param isCompany Профиль компании или соискателя.
   * @returns Данные для шаблона.
   */
  #describe(profile: Seeker | Employer | null, isCompany: boolean): Record<string, unknown> {
    if (profile === null) {
      return {
        isEmpty: true,
        empty: isCompany
          ? {
              title: 'Добавьте информацию о компании',
              text: 'Заполните профиль компании, чтобы соискатели могли узнать о вас больше.',
            }
          : { title: 'Заполните профиль', text: 'Расскажите о себе, чтобы работодатели могли узнать вас лучше.' },
      };
    }

    if (isCompany) {
      const { company_name: companyName, website, description } = profile as Employer;

      return {
        initials: getInitials(companyName),
        name: { label: 'Название компании', value: companyName },
        contact: { label: 'Сайт', value: website, href: getWebsiteHref(website) },
        about: { title: 'О компании', text: description },
      };
    }

    const { first_name: firstName, last_name: lastName, phone, description } = profile as Seeker;

    return {
      initials: getInitials(firstName, lastName),
      name: { label: 'Имя и фамилия', value: `${firstName} ${lastName}`.trim() },
      contact: { label: 'Телефон', value: phone },
      about: { title: 'О себе', text: description },
    };
  }
}
