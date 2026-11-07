import { ApiError, profileImageURL, getEmployer, getSeeker, type Employer, type Seeker } from '../api';
import type { Page } from '../router';
import { getCurrentUser } from '../session';
import { getWebsiteHref } from '../validation';
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
    const heading = isCompany ? 'Профиль компании' : 'Профиль';

    if (!user || user.id === null || user.role === null) {
      this.#container.innerHTML = template({ heading, error: 'Не удалось узнать, кто вошёл в аккаунт.', canRetry: false });
      return;
    }

    this.#container.innerHTML = template({
      heading,
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
        this.#container.innerHTML = template({ heading, error: (error as Error).message, canRetry: true });
        return;
      }

      profile = null;
    }

    const imageUrl = profileImageURL(isCompany ? (profile as Employer | null)?.logo_url : (profile as Seeker | null)?.avatar_url);
    this.#container.innerHTML = template({ heading, isCompany, imageUrl, ...this.#describe(profile, isCompany) });
    this.#container.querySelector('img')?.addEventListener('error', (event) => { (event.target as HTMLImageElement).hidden = true; }, { signal });
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
        initials: getInitials(companyName).slice(0, 1),
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
