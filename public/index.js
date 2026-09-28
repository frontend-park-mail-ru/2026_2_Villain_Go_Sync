import Header from './components/Header.js';
import { APP_NAME } from './config.js';
import LoginPage from './pages/LoginPage.js';
import NotFoundPage from './pages/NotFoundPage.js';
import RegisterPage from './pages/RegisterPage.js';
import VacanciesPage from './pages/VacanciesPage.js';
import Router from './router.js';

new Header().render(document.getElementById('header'));

new Router(document.getElementById('page'), { appName: APP_NAME })
  .register('/', { title: 'Вакансии', page: VacanciesPage })
  .register('/login', { title: 'Вход', page: LoginPage })
  .register('/register', { title: 'Регистрация', page: RegisterPage })
  .setNotFound({ title: 'Страница не найдена', page: NotFoundPage })
  .start();
