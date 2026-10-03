import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./VacanciesPage.hbs', import.meta.url));

const FILTERS = ['Go', 'C++', 'Python', 'DevOps', 'PostgreSQL', 'Backend'];

// Демо-данные из макета: страница пока не подключена к API.
const VACANCIES = [
  {
    title: 'Go-разработчик',
    company: 'TechNova',
    published: 'Опубликовано 2 часа назад',
    tags: ['Go', 'Backend', 'PostgreSQL', 'DevOps'],
    salary: '220 000–300 000 ₽',
  },
  {
    title: 'Backend-разработчик C++',
    company: 'Vector Labs',
    published: 'Опубликовано сегодня',
    tags: ['C++', 'Backend', 'PostgreSQL', 'DevOps'],
    salary: '200 000–280 000 ₽',
  },
  {
    title: 'Python-разработчик',
    company: 'DataFlow',
    published: 'Опубликовано вчера',
    tags: ['Python', 'Backend', 'PostgreSQL', 'DevOps'],
    salary: '180 000–260 000 ₽',
  },
  {
    title: 'DevOps-инженер',
    company: 'CloudCore',
    published: 'Опубликовано 3 дня назад',
    tags: ['DevOps', 'Backend', 'PostgreSQL', 'Python'],
    salary: '240 000–320 000 ₽',
  },
];

/**
 * Главная страница — лента вакансий.
 */
export default class VacanciesPage {
  /**
   * Рисует страницу в контейнер.
   * @param {HTMLElement} container Контейнер страницы.
   */
  render(container) {
    container.innerHTML = template({ filters: FILTERS, vacancies: VACANCIES });
    container.querySelector('.vacancies__search').addEventListener('submit', (event) => event.preventDefault());
  }
}
