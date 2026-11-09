import './styles/main.scss';

import { restoreSession } from './api';
import Header from './components/Header';
import { APP_NAME } from './config';
import ApplicantsPage from './pages/ApplicantsPage';
import LoginPage from './pages/LoginPage';
import MyVacanciesPage from './pages/MyVacanciesPage';
import NotFoundPage from './pages/NotFoundPage';
import ProfileFormPage from './pages/ProfileFormPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import ResumeFormPage from './pages/ResumeFormPage';
import ResumePage from './pages/ResumePage';
import ResumesPage from './pages/ResumesPage';
import VacanciesPage from './pages/VacanciesPage';
import VacancyFormPage from './pages/VacancyFormPage';
import VacancyPage from './pages/VacancyPage';
import Router from './router';
import { isAuthorized, onSessionChange } from './session';
import { showToast } from './components/toast';

/**
 * Не пускает вошедшего пользователя на страницы входа и регистрации.
 * @returns Путь главной страницы или `null`, если пользователь — гость.
 */
function redirectAuthorized(): string | null {
  return isAuthorized() ? '/' : null;
}

/**
 * Отправляет гостя на страницу входа со страниц, которые доступны только после входа.
 * @returns Путь страницы входа или `null`, если пользователь вошёл.
 */
function redirectGuest(): string | null {
  return isAuthorized() ? null : '/login';
}

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  navigator.serviceWorker.register('/sw.js');
}

/**
 * Проверяет сессию до запуска маршрутов. Сбой сети не считается подтверждённым выходом.
 */
async function startApplication(): Promise<void> {
  // Шапка и перенаправления зависят от сессии, поэтому сначала узнаём у бэкенда, вошёл ли пользователь.
  try {
    await restoreSession();
  } catch {
    const isPublic = window.location.pathname === '/' || /^\/(vacancies|resumes)\/[1-9]\d*\/?$/.test(window.location.pathname);
    if (!isPublic) {
      const container = document.getElementById('page')!;
      container.innerHTML = '<section class="empty-state"><h1 class="empty-state__title">Не удалось проверить вход</h1><p class="empty-state__text">Проверьте соединение и повторите попытку</p><button class="button button_secondary" type="button" data-session-retry>Повторить</button></section>';
      container.querySelector('button')!.addEventListener('click', () => { void startApplication(); }, { once: true });
      return;
    }
    showToast('Не удалось проверить вход. Для проверки сессии обновите страницу', 'error');
  }

  new Header().render(document.getElementById('header')!);

  const router = new Router(document.getElementById('page')!, { appName: APP_NAME });

  router
    .register('/', { title: 'Вакансии', page: VacanciesPage })
    .register('/vacancies/new', { title: 'Создание вакансии', page: VacancyFormPage, redirect: redirectGuest })
    .register('/vacancies/:id', { title: 'Вакансия', page: VacancyPage })
    .register('/vacancies/:id/edit', { title: 'Редактирование вакансии', page: VacancyFormPage, redirect: redirectGuest })
    .register('/applicants', { title: 'Соискатели', page: ApplicantsPage, redirect: redirectGuest })
    .register('/my/vacancies', { title: 'Мои вакансии', page: MyVacanciesPage, redirect: redirectGuest })
    .register('/resumes', { title: 'Мои резюме', page: ResumesPage, redirect: redirectGuest })
    .register('/resumes/new', { title: 'Создание резюме', page: ResumeFormPage, redirect: redirectGuest })
    .register('/resumes/:id', { title: 'Резюме', page: ResumePage })
    .register('/resumes/:id/edit', { title: 'Редактирование резюме', page: ResumeFormPage, redirect: redirectGuest })
    .register('/profile', { title: 'Профиль', page: ProfilePage, redirect: redirectGuest })
    .register('/profile/edit', { title: 'Редактирование профиля', page: ProfileFormPage, redirect: redirectGuest })
    .register('/login', { title: 'Вход', page: LoginPage, layout: 'auth', redirect: redirectAuthorized })
    .register('/register', { title: 'Регистрация', page: RegisterPage, layout: 'auth', redirect: redirectAuthorized })
    .setNotFound({ title: 'Страница не найдена', page: NotFoundPage })
    .start();

  // После входа или выхода страница перерисовывается: пропадают кнопки владельца, а гостя уводит на вход.
  onSessionChange(() => router.refresh());
}

await startApplication();
