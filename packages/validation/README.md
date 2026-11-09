# @hirenoon/validation

Проверки почты, пароля, телефона, адреса сайта, обязательного текста, сопроводительного письма
и изображения профиля. Клиентская валидация не заменяет серверную.

```ts
import { getEmailError, getPasswordError } from '@hirenoon/validation';

const emailError = getEmailError('user@example.com');
const passwordError = getPasswordError('Example123');
```

Функции `get*Error` возвращают сообщение об ошибке или пустую строку.
`getVacancyTitleError` и `getVacancyDescriptionError` проверяют название вакансии (до 100 символов)
и её описание (до 10 000). Лимиты экспортируются как `MAX_VACANCY_TITLE_LENGTH` и
`MAX_VACANCY_DESCRIPTION_LENGTH`; `countCharacters` считает кодовые точки Unicode, включая эмодзи.
`getResumeFieldError` и `getProfileFieldError` проверяют поля резюме и профиля;
лимиты экспортируются как `RESUME_FIELD_LIMITS` и `PROFILE_FIELD_LIMITS`.

| Поле | Максимум символов |
| --- | ---: |
| Название резюме | 100 |
| Описание в резюме | 10 000 |
| Опыт в резюме | 5000 |
| Образование в резюме | 2000 |
| Имя и фамилия в профиле | по 100 |
| Название компании | 200 |
| О себе / о компании | 10 000 |

Пустые необязательные поля допускаются. Сообщения об ошибках не содержат точки в конце.
Телефон проверяет `getPhoneError`: формат, от 10 до 15 цифр и защитный предел длины строки
с разделителями. У поля нет счётчика символов; при любой ошибке показывается «Введите корректный номер телефона».
Адрес сайта проверяет `getWebsiteError`: HTTP(S), корректный домен и до 255 символов с учётом протокола.
Счётчика нет; при любой ошибке показывается «Введите корректный адрес сайта». Пустой адрес допускается.

`hasVisibleText` проверяет наличие видимого текста, `normalizeWebsite` нормализует URL,
а `getWebsiteHref` проверяет URL для ссылки. Также экспортируется `MAX_COVER_LETTER_LENGTH`.
`getProfileImageError` принимает браузерный `File`.

Из корня репозитория: `npm run build --workspace @hirenoon/validation`.
Сборка создаёт ESM JavaScript и декларации TypeScript в `dist/`.
