const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const TEXT_FIELDS = new Set(['title', 'description', 'experience', 'education', 'company_name',
  'first_name', 'last_name', 'website', 'resume_title', 'vacancy_title']);

/**
 * Декодирует один слой сущностей текстового API; результат по-прежнему экранируется шаблоном.
 * @param value Текст, обработанный серверным санитайзером.
 * @returns Обычный текст, который нельзя вставлять как HTML.
 */
export function decodeAPIText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity, name: string) => {
    if (!name.startsWith('#')) { return ENTITIES[name.toLowerCase()] ?? entity; }
    const code = name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
}

/**
 * Нормализует только известные текстовые поля ответа; URL изображений, статусы и токены не меняет.
 * @param data Поле data успешного ответа API.
 * @returns Данные с текстом для экранируемых шаблонов.
 */
export function normalizeAPIText(data: unknown): unknown {
  if (Array.isArray(data)) { return data.map(normalizeAPIText); }
  if (typeof data !== 'object' || data === null) { return data; }
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    TEXT_FIELDS.has(key) && typeof value === 'string' ? decodeAPIText(value) : normalizeAPIText(value),
  ]));
}
