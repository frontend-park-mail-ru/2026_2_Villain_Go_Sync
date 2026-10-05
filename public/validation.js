// Правила повторяют проверки бэкенда, чтобы ошибка была видна до отправки формы.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_CHARS_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]+$/;

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

/**
 * Проверяет почту.
 * @param {string} email Почта.
 * @returns {string} Текст ошибки или пустая строка, если почта корректна.
 */
export function getEmailError(email) {
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Введите корректный email';
  }

  return '';
}

/**
 * Проверяет пароль для регистрации: длина, регистр букв, цифра и допустимые символы.
 * @param {string} password Пароль.
 * @returns {string} Текст ошибки или пустая строка, если пароль подходит.
 */
export function getPasswordError(password) {
  const isValid =
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    PASSWORD_CHARS_PATTERN.test(password);

  return isValid ? '' : 'Пароль не соответствует требованиям';
}
