# 2026_2_Villain_Go_Sync

Frontend-репозиторий команды "Злодей Go Synс". Проект - Headhunter

## Участники команды
- [Михаил Фролов](https://github.com/frolovme74)
- [Александр Воронков](https://github.com/Alexrovr)
- [Дарья Колесникова](https://github.com/kolesnikovadash-dev)
- [Герман Богуславский](https://github.com/NoPo6)

## Менторы
- frontend - [Александр Новиков](https://github.com/Wolfsanek2)
- backend - [Алексей Земляков](https://github.com/Alexeyzem)

## Ссылки
[Backend](https://github.com/go-park-mail-ru/2026_2_villain_go_sync_backend)

## Запуск

```bash
npm install
npm run dev        # dev-сервер на http://localhost:8000, пересобирает при изменениях
npm run build      # сборка для прода в папку dist/
npm run typecheck  # проверка типов TypeScript
npm run lint       # проверка линтером (npm run lint:fix — исправить автоматически)
```

Настройки сервера задаются переменными окружения или файлом `.env` в корне проекта (образец — `.env.example`).
Переменные окружения имеют приоритет над файлом; после изменения `.env` сервер нужно перезапустить.

- `PORT` — порт фронтенда, по умолчанию `8000`;
- `API_URL` — адрес бэкенда, по умолчанию `http://localhost:8080/api`. Фронтенд обращается к нему напрямую
  и передаёт cookie сессии, поэтому на бэкенде для адреса фронтенда должен быть разрешён CORS.

## Собственные пакеты

Общие модули оформлены как отдельные npm-пакеты в `packages/`:

- `@hirenoon/validation` — проверки полей форм и изображений профиля;
- `@hirenoon/format` — форматирование зарплаты и даты публикации вакансии.

У каждого пакета есть свой `package.json`, публичные экспорты и сборка JavaScript с декларациями TypeScript.
Приложение указывает пакеты в `dependencies` и импортирует их по имени:

```ts
import { getEmailError } from '@hirenoon/validation';
import { formatSalary } from '@hirenoon/format';
```

Пакеты подключаются через npm workspaces: `npm install` или `npm ci` в корне устанавливает зависимости,
создаёт ссылки на локальные пакеты в `node_modules/@hirenoon/` и собирает их через `prepare`.
Публикация в npm для работы проекта не нужна. Сгенерированные файлы `packages/*/dist/` не хранятся в Git.

Перед `npm run dev`, `npm run build` и `npm run typecheck` пакеты собираются автоматически.
Если исходники пакета изменены при работающем dev-сервере, выполните в другом терминале
`npm run build:packages`; webpack подхватит обновлённые файлы.

Для создания устанавливаемого архива отдельного пакета выполните из корня:

```bash
npm pack --workspace @hirenoon/validation
npm pack --workspace @hirenoon/format
```

Перед упаковкой пакет автоматически собирается; архив содержит JavaScript и типы и может быть установлен
в другом проекте командой `npm install <путь-к-архиву.tgz>`.
