import { ApiError } from '../api';
import { evaluateOnlineConfFlag } from './onlineconf-api';

const section = document.querySelector<HTMLElement>('#flag-check')!;
const dialog = document.querySelector<HTMLDialogElement>('#key-dialog')!;
const form = document.querySelector<HTMLFormElement>('#flag-check-form')!;
const input = document.querySelector<HTMLInputElement>('#flag-check-user')!;
const submit = document.querySelector<HTMLButtonElement>('#flag-check-submit')!;
const feedback = document.querySelector<HTMLElement>('#flag-check-feedback')!;

const explanations: ReadonlyMap<string, string> = new Map([
  ['globally_disabled', 'Флаг выключен для всех.'],
  ['forced_include', 'Пользователь в списке принудительного включения.'],
  ['forced_exclude', 'Пользователь в списке принудительного исключения.'],
  ['rollout_included', 'Пользователь попал в процент раскатки.'],
  ['rollout_excluded', 'Пользователь вне процента раскатки.'],
]);

let flagId: number | undefined;
let version = 0;

/** Очищает результат и отменяет отображение устаревшего запроса. */
function resetFeedback(): void {
  version += 1;
  submit.disabled = false;
  feedback.replaceChildren();
  delete feedback.dataset.tone;
}

/**
 * Подключает проверку к открытому флагу каталога.
 * @param id Идентификатор флага из серверного каталога.
 */
export function prepareFlagCheck(id?: number): void {
  flagId = id;
  section.hidden = id === undefined;
  form.reset();
  resetFeedback();
}

/**
 * Формирует сообщение об ошибке проверки.
 * @param error Ошибка API или обработки ответа.
 * @param userId Введённый ID.
 * @returns Сообщение для администратора.
 */
function getErrorMessage(error: unknown, userId: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) { return 'Сессия истекла. Войдите в HireNoon.'; }
    if (error.status === 403) { return 'У вас нет доступа к проверке флага.'; }
    if (error.status === 404) { return 'Флаг больше недоступен. Обновите каталог.'; }
    if (error.status === 400) { return 'Проверьте формат ID пользователя.'; }
    if (error.status === 422 && error.body === 'product user does not exist') {
      return `Пользователь с ID ${userId} не найден.`;
    }
  }
  return 'Не удалось проверить флаг. Повторите попытку.';
}

/**
 * Показывает серверное решение и объясняет причину.
 * @param id Идентификатор открытого флага.
 * @param userId Проверяемый пользователь.
 */
async function checkFlag(id: number, userId: string): Promise<void> {
  resetFeedback();
  const request = version;
  submit.disabled = true;
  feedback.textContent = 'Проверяем флаг…';

  try {
    const result = await evaluateOnlineConfFlag(id, userId);
    if (!dialog.open || request !== version) { return; }
    const title = document.createElement('strong');
    title.textContent = `Для пользователя ${userId} флаг ${result.enabled ? 'включён' : 'выключен'}`;
    const details = document.createElement('p');
    const explanation = explanations.get(result.reason) ?? 'Проверьте настройки раскатки флага.';
    details.textContent = result.bucket === undefined
      ? explanation
      : `${explanation} Раскатка ${result.rollout}%, группа ${result.bucket}.`;
    feedback.dataset.tone = result.enabled ? 'on' : 'off';
    feedback.replaceChildren(title, details);
  } catch (error) {
    if (!dialog.open || request !== version) { return; }
    feedback.dataset.tone = 'error';
    feedback.textContent = getErrorMessage(error, userId);
  } finally {
    if (request === version) { submit.disabled = false; }
  }
}

input.addEventListener('input', resetFeedback);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (flagId !== undefined && !submit.disabled) { void checkFlag(flagId, input.value); }
});
