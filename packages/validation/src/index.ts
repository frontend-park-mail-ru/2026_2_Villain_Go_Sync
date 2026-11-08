// Клиентские проверки показывают ошибки до отправки формы; сервер проверяет данные независимо.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_CHARS_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]+$/;

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

/**
 * Проверяет почту.
 * @param email Почта.
 * @returns Текст ошибки или пустая строка, если почта корректна.
 */
export function getEmailError(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email) || local.length > 64 ||
    local.startsWith('.') || local.endsWith('.') || local.includes('..') || !isValidHostname(domain)) {
    return 'Введите корректный адрес электронной почты';
  }

  return '';
}

/**
 * Проверяет непустые доменные метки без дефисов на краях.
 * @param hostname Домен в ASCII или punycode.
 * @returns Корректен ли домен с точкой.
 */
function isValidHostname(hostname: string): boolean {
  return hostname.length <= 253 && hostname.includes('.') && hostname.split('.').every((label) =>
    label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label));
}

/**
 * Проверяет наличие видимых символов в обязательном поле.
 * @param value Значение поля.
 * @returns Есть ли текст кроме пробелов и форматирующих символов.
 */
export function hasVisibleText(value: string): boolean {
  return value.replace(/[\s\p{Cf}]/gu, '').length > 0;
}

export const MAX_COVER_LETTER_LENGTH = 10_000;

/**
 * Проверяет формат и размер выбранного изображения профиля.
 * @param file Выбранный файл.
 * @returns Текст ошибки или пустая строка.
 */
export function getProfileImageError(file: File): string {
  return !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024
    ? 'Выберите PNG, JPEG или WebP размером от 1 байта до 10 МБ.' : '';
}

/**
 * Проверяет длину письма с запасом относительно лимита JSON-запроса API в 64 КиБ.
 * @param value Сопроводительное письмо.
 * @returns Сообщение об ошибке или пустая строка.
 */
export function getCoverLetterError(value: string): string {
  return value.length > MAX_COVER_LETTER_LENGTH ? 'Сократите письмо до 10 000 символов.' : '';
}

/**
 * Проверяет пароль для регистрации: длина, регистр букв, цифра и допустимые символы.
 * @param password Пароль.
 * @returns Текст ошибки или пустая строка, если пароль подходит.
 */
export function getPasswordError(password: string): string {
  const isValid =
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    PASSWORD_CHARS_PATTERN.test(password);

  return isValid ? '' : 'Пароль не соответствует требованиям';
}

// Телефон и сайт бэкенд не проверяет, поэтому правила ниже есть только на фронтенде.
const PHONE_CHARS_PATTERN = /^\+?[\d\s()-]+$/;
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

/**
 * Проверяет телефон: цифры, пробелы, скобки, дефисы и плюс в начале.
 * @param phone Телефон; пустой допускается.
 * @returns Текст ошибки или пустая строка, если телефон подходит.
 */
export function getPhoneError(phone: string): string {
  const digits = phone.replace(/\D/g, '').length;
  const isValid =
    !phone || (PHONE_CHARS_PATTERN.test(phone) && digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS);

  return isValid ? '' : 'Введите корректный номер телефона.';
}

/**
 * Приводит адрес сайта к виду с протоколом: `example.ru` → `https://example.ru`.
 * @param website Адрес; пустой допускается.
 * @returns Адрес с протоколом, пустая строка для пустого адреса или `null`, если адрес некорректен.
 */
export function normalizeWebsite(website: string): string | null {
  if (!website) {
    return '';
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(website) ? website : `https://${website}`;

  try {
    const url = new URL(withProtocol);

    return /^https?:$/.test(url.protocol) && isValidHostname(url.hostname) &&
      !url.username && !url.password && !/\s/.test(website) ? withProtocol : null;
  } catch {
    return null;
  }
}

/**
 * Возвращает адрес сайта для ссылки, если его безопасно подставить в `href`.
 * @param website Адрес из профиля.
 * @returns Ссылка или `null`, если адрес не начинается с http:// или https://.
 */
export function getWebsiteHref(website: string): string | null {
  return /^https?:\/\//i.test(website) ? normalizeWebsite(website) : null;
}
