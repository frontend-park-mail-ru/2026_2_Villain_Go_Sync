import './styles/main.scss';

import { restoreSession } from './api';
import Header from './components/Header';
import { APP_NAME } from './config';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import VacanciesPage from './pages/VacanciesPage';
import Router from './router';
import { isAuthorized } from './session';

/**
 * Не пускает вошедшего пользователя на страницы входа и регистрации.
 * @returns Путь главной страницы или `null`, если пользователь — гость.
 */
function redirectAuthorized(): string | null {
  return isAuthorized() ? '/' : null;
}

// Шапка и перенаправления зависят от сессии, поэтому сначала узнаём у бэкенда, вошёл ли пользователь.
await restoreSession();

new Header().render(document.getElementById('header')!);

new Router(document.getElementById('page')!, { appName: APP_NAME })
  .register('/', { title: 'Вакансии', page: VacanciesPage })
  .register('/login', { title: 'Вход', page: LoginPage, layout: 'auth', redirect: redirectAuthorized })
  .register('/register', { title: 'Регистрация', page: RegisterPage, layout: 'auth', redirect: redirectAuthorized })
  .setNotFound({ title: 'Страница не найдена', page: NotFoundPage })
  .start();
