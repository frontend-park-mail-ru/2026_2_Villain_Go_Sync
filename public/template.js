/**
 * Загружает Handlebars-шаблон и компилирует его.
 * @param {URL | string} url Адрес .hbs-файла.
 * @returns {Promise<(context?: object) => string>} Функция шаблона.
 */
export async function loadTemplate(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить шаблон ${url}: ${response.status}`);
  }

  return Handlebars.compile(await response.text());
}
