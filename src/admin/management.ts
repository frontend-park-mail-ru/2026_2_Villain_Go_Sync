import { ApiError } from '../api';
import renderManagementRows from './management-rows.hbs';
import {
  deleteOnlineConfAdmin, deleteOnlineConfScope, getOnlineConfAdmins, getOnlineConfScopes, saveOnlineConfAdmin, saveOnlineConfScope,
  type OnlineConfAdmin, type OnlineConfRole, type OnlineConfScope,
} from './onlineconf-api';

const scopesButton = document.querySelector<HTMLButtonElement>('#open-scopes')!;
const adminsButton = document.querySelector<HTMLButtonElement>('#open-admins')!;
const dialog = document.querySelector<HTMLDialogElement>('#management-dialog')!;
const closeButton = document.querySelector<HTMLButtonElement>('#management-close')!;
const list = document.querySelector<HTMLElement>('#management-list')!;
const status = document.querySelector<HTMLElement>('#management-status')!;
const retry = document.querySelector<HTMLButtonElement>('#management-retry')!;
const form = document.querySelector<HTMLFormElement>('#management-form')!;
const formTitle = document.querySelector<HTMLElement>('#management-form-title')!;
const errorText = document.querySelector<HTMLElement>('#management-error')!;
const fields = document.querySelector<HTMLFieldSetElement>('#management-fields')!;
const scopeFields = document.querySelector<HTMLFieldSetElement>('#management-scope-fields')!;
const adminFields = document.querySelector<HTMLFieldSetElement>('#management-admin-fields')!;
const scopeName = document.querySelector<HTMLInputElement>('#management-scope-name')!;
const scopeDescription = document.querySelector<HTMLTextAreaElement>('#management-scope-description')!;
const userId = document.querySelector<HTMLInputElement>('#management-user-id')!;
const role = document.querySelector<HTMLSelectElement>('#management-role')!;
const cancel = document.querySelector<HTMLButtonElement>('#management-cancel')!;
const submit = document.querySelector<HTMLButtonElement>('#management-submit')!;

type Mode = 'scopes' | 'admins';
const roleLabels = { owner: 'Владелец', admin: 'Администратор' };
let mode: Mode = 'scopes';
let editing: number | undefined;
let actorId: number;
let version = 0;
let busy = false;
let scopes: OnlineConfScope[] = [];
let admins: OnlineConfAdmin[] = [];
let onScopesChange: (next: OnlineConfScope[]) => void;

/** Обновляет список открытого раздела. */
function renderList(): void {
  const rows = mode === 'scopes'
    ? scopes.map(({ id, name, description }) => ({ id, title: name, detail: description, deleteLabel: 'Удалить' }))
    : admins.map((admin) => ({ id: admin.userId, title: `Пользователь #${admin.userId}`, detail: roleLabels[admin.role], deleteLabel: 'Отозвать доступ' }));
  list.innerHTML = renderManagementRows({ rows });
  status.textContent = rows.length > 0 ? '' : 'В разделе пока нет записей.';
}

/**
 * Подставляет данные записи или переключает форму в режим создания.
 * @param id ID существующей записи.
 */
function selectRecord(id?: number): void {
  editing = id;
  form.reset();
  scopeFields.disabled = scopeFields.hidden = mode !== 'scopes';
  adminFields.disabled = adminFields.hidden = mode !== 'admins';
  userId.readOnly = id !== undefined;
  errorText.hidden = true;
  cancel.hidden = id === undefined;

  if (mode === 'scopes') {
    const scope = scopes.find((item) => item.id === id);
    scopeName.value = scope?.name ?? '';
    scopeDescription.value = scope?.description ?? '';
    formTitle.textContent = id === undefined ? 'Новая область' : 'Редактировать область';
    if (id !== undefined) { scopeName.focus(); }
  } else {
    const admin = admins.find((item) => item.userId === id);
    userId.value = admin ? String(admin.userId) : '';
    role.value = admin?.role ?? 'admin';
    formTitle.textContent = id === undefined ? 'Выдать доступ' : 'Изменить роль';
    if (id !== undefined) { role.focus(); }
  }
  submit.textContent = id !== undefined ? 'Сохранить' : mode === 'scopes' ? 'Добавить область' : 'Выдать доступ';
}

/** Загружает список для открытого диалога. */
async function load(): Promise<void> {
  const request = ++version;
  retry.hidden = true;
  status.textContent = 'Загружаем…';
  form.hidden = true;
  list.replaceChildren();
  try {
    if (mode === 'scopes') {
      const next = await getOnlineConfScopes();
      if (!dialog.open || version !== request) { return; }
      scopes = next;
      onScopesChange(scopes);
    } else {
      const next = await getOnlineConfAdmins();
      if (!dialog.open || version !== request) { return; }
      admins = next;
    }
    renderList();
    selectRecord();
    form.hidden = false;
  } catch (error) {
    if (!dialog.open || version !== request) { return; }
    status.textContent = error instanceof ApiError && error.status === 403
      ? 'У вас нет доступа к этому разделу.'
      : 'Не удалось загрузить список.';
    retry.hidden = false;
  }
}

/**
 * Показывает ошибку записи.
 * @param error Ошибка запроса.
 * @param deleting Удаляется ли запись.
 */
function showError(error: unknown, deleting: boolean): void {
  const code = error instanceof ApiError ? error.status : undefined;
  let message = 'Не удалось сохранить изменение. Повторите попытку.';
  if (code === 401) { message = 'Сессия истекла. Войдите в HireNoon.'; }
  if (code === 403) { message = 'У вас нет прав на это действие.'; }
  if (code === 404) { message = 'Эта запись уже недоступна.'; }
  if (code === 409) {
    message = mode === 'scopes'
      ? deleting ? 'Удалить можно только пустую область.' : 'Область с таким названием уже существует.'
      : 'Проверьте текущую роль пользователя. У OnlineConf должен остаться хотя бы один владелец.';
  }
  if (code === 400 || code === 422) {
    message = mode === 'scopes' ? 'Проверьте название области.' : 'Проверьте, существует ли пользователь с таким ID.';
  }
  errorText.textContent = message;
  errorText.hidden = false;
}

/**
 * Блокирует повторные записи, обновляет список после ответа.
 * @param change Запрос на изменение, который обновляет данные списка.
 * @param deleting Удаляется ли запись.
 */
async function update(change: () => Promise<void>, deleting: boolean): Promise<void> {
  busy = closeButton.disabled = fields.disabled = submit.disabled = cancel.disabled = true;
  list.inert = true;
  errorText.hidden = true;
  try {
    await change();
    if (mode === 'scopes') { onScopesChange(scopes); }
    renderList();
    selectRecord();
    status.textContent = deleting ? 'Запись удалена.' : 'Изменение сохранено.';
  } catch (error) {
    showError(error, deleting);
  } finally {
    busy = closeButton.disabled = fields.disabled = submit.disabled = cancel.disabled = false;
    list.inert = false;
  }
}

/**
 * Открывает нужный раздел и запрашивает список.
 * @param section Раздел управления.
 */
function open(section: Mode): void {
  mode = section;
  document.querySelector('#management-title')!.textContent = section === 'scopes' ? 'Области OnlineConf' : 'Администраторы OnlineConf';
  dialog.showModal();
  void load();
}

/**
 * Показывает действия, разрешённые текущему администратору.
 * @param currentId ID текущего пользователя.
 * @param currentRole Роль из API.
 * @param handleScopes Функция обновления областей в продуктовом каталоге ключей.
 */
export function enableManagement(currentId: number, currentRole: OnlineConfRole, handleScopes: (next: OnlineConfScope[]) => void): void {
  actorId = currentId;
  onScopesChange = handleScopes;
  scopesButton.hidden = false;
  adminsButton.hidden = currentRole !== 'owner';
}

scopesButton.addEventListener('click', () => open('scopes'));
adminsButton.addEventListener('click', () => open('admins'));
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', (event) => { if (busy) { event.preventDefault(); } });
retry.addEventListener('click', () => { void load(); });
cancel.addEventListener('click', () => selectRecord());
form.addEventListener('input', () => { errorText.hidden = true; });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) { return; }
  if (mode === 'scopes') {
    void update(async () => {
      const saved = await saveOnlineConfScope({ name: scopeName.value, description: scopeDescription.value.trim() || null }, editing);
      scopes = editing === undefined ? [...scopes, saved] : scopes.map((item) => item.id === saved.id ? saved : item);
    }, false);
  } else {
    void update(async () => {
      const saved = await saveOnlineConfAdmin(userId.valueAsNumber, role.value as OnlineConfRole, editing !== undefined);
      admins = editing === undefined ? [...admins, saved] : admins.map((item) => item.userId === saved.userId ? saved : item);
      if (saved.userId === actorId && saved.role !== 'owner') { window.location.reload(); }
    }, false);
  }
});
list.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-management-action]');
  if (!button || busy) { return; }
  const id = Number(button.dataset.recordId);
  if (button.dataset.managementAction === 'edit') {
    selectRecord(id);
    return;
  }
  const question = mode === 'scopes'
    ? `Удалить область «${scopes.find((scope) => scope.id === id)?.name}»?`
    : `Отозвать доступ к OnlineConf у пользователя #${id}?`;
  if (!window.confirm(question)) { return; }
  void update(async () => {
    if (mode === 'scopes') {
      await deleteOnlineConfScope(id);
      scopes = scopes.filter((item) => item.id !== id);
    } else {
      await deleteOnlineConfAdmin(id);
      admins = admins.filter((item) => item.userId !== id);
      if (id === actorId) { window.location.reload(); }
    }
  }, true);
});
