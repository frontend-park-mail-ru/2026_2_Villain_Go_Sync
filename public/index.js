import { restoreSession } from './api.js';
import Header from './components/Header.js';
import { APP_NAME } from './config.js';
import LoginPage from './pages/LoginPage.js';
import NotFoundPage from './pages/NotFoundPage.js';
import RegisterPage from './pages/RegisterPage.js';
import VacanciesPage from './pages/VacanciesPage.js';
import Router from './router.js';
import { isAuthorized } from './session.js';

/**
 * Не пускает вошедшего пользователя на страницы входа и регистрации.
 * @returns {string | null} Путь главной страницы или `null`, если пользователь — гость.
 */
function redirectAuthorized() {
  return isAuthorized() ? '/' : null;
}

// Шапка и перенаправления зависят от сессии, поэтому сначала узнаём у бэкенда, вошёл ли пользователь.
await restoreSession();

new Header().render(document.getElementById('header'));

new Router(document.getElementById('page'), { appName: APP_NAME })
  .register('/', { title: 'Вакансии', page: VacanciesPage })
  .register('/login', { title: 'Вход', page: LoginPage, layout: 'auth', redirect: redirectAuthorized })
  .register('/register', { title: 'Регистрация', page: RegisterPage, layout: 'auth', redirect: redirectAuthorized })
  .setNotFound({ title: 'Страница не найдена', page: NotFoundPage })
  .start();
