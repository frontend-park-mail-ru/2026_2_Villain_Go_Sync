// Правила повторяют проверки бэкенда, чтобы ошибка была видна до отправки формы.
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
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Введите корректный адрес электронной почты';
  }

  return '';
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

    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') && !/\s/.test(website) ? withProtocol : null;
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
  return /^https?:\/\//i.test(website) ? website : null;
}
