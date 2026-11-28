import { ApiError } from '../api';
import type { JsonValue, OnlineConfKey } from './keys';
import { FlagOverridesSaveError } from './onlineconf-api';

interface EditorOptions {
  key?: OnlineConfKey;
  scope: string;
  kind: OnlineConfKey['kind'];
  scopes: string[];
  live: boolean;
}

const dialog = document.querySelector<HTMLDialogElement>('#key-editor')!;
const form = document.querySelector<HTMLFormElement>('#key-form')!;
const fields = document.querySelector<HTMLFieldSetElement>('#editor-fields')!;
const configFields = document.querySelector<HTMLFieldSetElement>('#editor-config')!;
const flagFields = document.querySelector<HTMLFieldSetElement>('#editor-flag')!;
const nameField = document.querySelector<HTMLInputElement>('#editor-name')!;
const scopeField = document.querySelector<HTMLInputElement>('#editor-scope')!;
const kindField = document.querySelector<HTMLSelectElement>('#editor-kind')!;
const descriptionField = document.querySelector<HTMLTextAreaElement>('#editor-description')!;
const valueField = document.querySelector<HTMLTextAreaElement>('#editor-value')!;
const enabledField = document.querySelector<HTMLInputElement>('#editor-enabled')!;
const rolloutField = document.querySelector<HTMLInputElement>('#editor-rollout')!;
const includedField = document.querySelector<HTMLTextAreaElement>('#editor-included')!;
const excludedField = document.querySelector<HTMLTextAreaElement>('#editor-excluded')!;
const errorText = document.querySelector<HTMLElement>('#editor-error')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save-key')!;
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-editor')!;

const saveErrors: Record<number, string> = {
  400: 'Сервер отклонил параметры ключа. Проверьте поля формы.',
  401: 'Сессия истекла. Войдите в HireNoon и повторите попытку.',
  403: 'У вас нет прав на сохранение этого ключа.',
  404: 'Ключ больше недоступен. Обновите каталог.',
  409: 'Ключ с таким названием уже есть в этой области.',
  422: 'Сервер отклонил параметры ключа. Проверьте поля формы.',
};

/** Переключает поля, которые доступны для выбранного типа ключа. */
function updateTypeFields(): void {
  const isFlag = kindField.value === 'flag';
  configFields.hidden = configFields.disabled = isFlag;
  flagFields.hidden = flagFields.disabled = !isFlag;
}

/**
 * Разбирает список ID и сохраняет представление уже существующих идентификаторов.
 * @param text Значение поля формы.
 * @param previous ID из сохранённого ключа.
 * @returns Уникальные идентификаторы.
 */
function readUsers(text: string, previous: (number | string)[] = []): (number | string)[] {
  const ids = new Set(text.split(/[,\s]+/).filter(Boolean));
  const originals = new Map(previous.map((id) => [String(id), id]));
  return [...ids].map((id) => originals.get(id) ?? id);
}

/**
 * Проверяет форму и готовит данные ключа.
 * @param original Ключ перед редактированием.
 * @returns Данные для запроса сохранения.
 * @throws {Error} В форме указаны некорректные данные.
 */
function readKey(original?: OnlineConfKey): OnlineConfKey {
  const name = original?.name ?? nameField.value.trim();
  const scope = original?.scope ?? scopeField.value.trim();
  if (!name || !scope) { throw new Error('Укажите название и scope.'); }

  const fields = { name, scope, description: descriptionField.value.trim() };
  if (kindField.value === 'flag') {
    const flag = original?.kind === 'flag' ? original : undefined;
    const included = readUsers(includedField.value, flag?.included_users);
    const excluded = readUsers(excludedField.value, flag?.excluded_users);
    const includedIds = new Set(included.map(String));
    if (excluded.some((id) => includedIds.has(String(id)))) {
      throw new Error('Уберите совпадающие ID из списков включения и исключения.');
    }
    return {
      ...fields,
      kind: 'flag',
      enabled: enabledField.checked,
      rollout: rolloutField.valueAsNumber,
      included_users: included,
      excluded_users: excluded,
    };
  }

  try {
    const value = JSON.parse(valueField.value, (_key, item: unknown) => {
      if (typeof item === 'number' && !Number.isFinite(item)) { throw new SyntaxError(); }
      return item;
    }) as JsonValue;
    return { ...fields, kind: 'config', value };
  } catch {
    throw new Error('Введите корректное значение JSON с конечными числами.');
  }
}

/**
 * Подключает форму к каталогу и возвращает функцию её открытия.
 * @param save Сохраняет данные в текущем источнике каталога.
 * @param onSaved Обновляет интерфейс после закрытия формы.
 * @returns Функция открытия формы создания или редактирования.
 */
export function bindKeyEditor(
  save: (draft: OnlineConfKey, original?: OnlineConfKey, pending?: string[]) => Promise<OnlineConfKey>,
  onSaved: (saved: OnlineConfKey) => void,
): (options: EditorOptions) => void {
  let original: OnlineConfKey | undefined;
  let allowedScopes: string[] | undefined;
  let pending: string[] = [];

  /** Проверяет форму и сохраняет ключ, пока поле ввода заблокировано. */
  async function submit(): Promise<void> {
    errorText.hidden = true;
    let draft: OnlineConfKey;
    try {
      draft = readKey(original);
      if (allowedScopes && !allowedScopes.includes(draft.scope)) {
        throw new Error('Выберите существующий scope из списка.');
      }
      if (allowedScopes && draft.kind === 'flag') {
        const users = [...(draft.included_users ?? []), ...(draft.excluded_users ?? [])];
        if (users.some((id) => !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)))) {
          throw new Error('ID пользователя должен быть положительным целым числом.');
        }
      }
    } catch (error) {
      errorText.textContent = error instanceof Error ? error.message : 'Проверьте поля формы.';
      errorText.hidden = false;
      return;
    }

    fields.disabled = saveButton.disabled = cancelButton.disabled = true;
    saveButton.textContent = 'Сохраняем…';
    let saved: OnlineConfKey;
    try {
      saved = await save(draft, original, pending);
    } catch (error) {
      const reason = error instanceof FlagOverridesSaveError ? error.cause : error;
      const message = reason instanceof ApiError
        ? saveErrors[reason.status] ?? 'Не удалось сохранить настройки. Повторите попытку.'
        : 'Не удалось подтвердить сохранение. Обновите каталог перед повторной попыткой.';
      if (error instanceof FlagOverridesSaveError) {
        pending = error.pending;
        original = {
          ...error.flag,
          included_users: original?.kind === 'flag' ? original.included_users : [],
          excluded_users: original?.kind === 'flag' ? original.excluded_users : [],
        };
        document.querySelector('#editor-title')!.textContent = 'Редактировать ключ';
        nameField.readOnly = scopeField.readOnly = kindField.disabled = true;
        const detail = reason instanceof ApiError && reason.body === 'product user does not exist'
          ? 'Проверьте, что указанные ID пользователей существуют.'
          : message;
        errorText.textContent = `${error.message} ${detail}`;
      } else {
        errorText.textContent = message;
      }
      errorText.hidden = false;
      return;
    } finally {
      fields.disabled = saveButton.disabled = cancelButton.disabled = false;
      saveButton.textContent = 'Сохранить';
    }

    dialog.close();
    onSaved(saved);
  }

  kindField.addEventListener('change', updateTypeFields);
  form.addEventListener('input', () => { errorText.hidden = true; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!saveButton.disabled) { void submit(); }
  });
  cancelButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (saveButton.disabled) { event.preventDefault(); }
  });

  return ({ key, scope, kind, scopes, live }) => {
    original = key;
    pending = [];
    allowedScopes = live ? scopes : undefined;
    const edit = key !== undefined;
    form.reset();
    errorText.hidden = true;
    document.querySelector('#editor-title')!.textContent = edit ? 'Редактировать ключ' : 'Создать ключ';
    document.querySelector('#editor-scopes')!.replaceChildren(...scopes.map((name) => new Option(name)));
    nameField.readOnly = scopeField.readOnly = kindField.disabled = edit;
    nameField.value = key?.name ?? '';
    scopeField.value = key?.scope ?? scope;
    kindField.value = key?.kind ?? kind;
    descriptionField.value = key?.description ?? '';
    valueField.value = key?.kind === 'config' ? JSON.stringify(key.value, null, 2) : '';
    enabledField.checked = key?.kind === 'flag' && key.enabled;
    rolloutField.value = key?.kind === 'flag' ? String(key.rollout) : '0';
    if (key?.kind === 'flag') {
      includedField.value = key.included_users?.join(', ') ?? '';
      excludedField.value = key.excluded_users?.join(', ') ?? '';
    }
    updateTypeFields();
    dialog.showModal();
    if (edit) { descriptionField.focus(); }
  };
}
