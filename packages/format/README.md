# @hirenoon/format

Форматирование зарплаты и даты публикации вакансии для русского интерфейса HireNoon.

```ts
import { formatSalary, formatPublished } from '@hirenoon/format';

const salary = formatSalary(100000, 150000, 'RUB');
const published = formatPublished('2026-11-08T09:00:00Z');
```

`formatSalary` принимает нижнюю и верхнюю границы зарплаты (`number | null`) и код валюты
(по умолчанию `RUB`). `formatPublished` принимает дату ISO и возвращает текст о времени публикации;
для некорректной даты возвращает пустую строку.

Из корня репозитория: `npm run build --workspace @hirenoon/format`.
Сборка создаёт ESM JavaScript и декларации TypeScript в `dist/`.
