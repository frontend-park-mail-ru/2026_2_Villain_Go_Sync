# @hirenoon/validation

Проверки почты, пароля, телефона, адреса сайта, обязательного текста, сопроводительного письма
и изображения профиля. Клиентская валидация не заменяет серверную.

```ts
import { getEmailError, getPasswordError } from '@hirenoon/validation';

const emailError = getEmailError('user@example.com');
const passwordError = getPasswordError('Example123');
```

Функции `get*Error` возвращают сообщение об ошибке или пустую строку.
`hasVisibleText` проверяет наличие видимого текста, `normalizeWebsite` нормализует URL,
а `getWebsiteHref` проверяет URL для ссылки. Также экспортируется `MAX_COVER_LETTER_LENGTH`.
`getProfileImageError` принимает браузерный `File`.

Из корня репозитория: `npm run build --workspace @hirenoon/validation`.
Сборка создаёт ESM JavaScript и декларации TypeScript в `dist/`.
