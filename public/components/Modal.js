import { loadTemplate } from '../template.js';

const template = await loadTemplate(new URL('./Modal.hbs', import.meta.url));

/**
 * Показывает модальное окно с вопросом и двумя кнопками.
 * @param {object} options Содержимое окна.
 * @param {string} options.title Заголовок.
 * @param {string} options.text Текст вопроса.
 * @param {string} options.confirmLabel Подпись кнопки подтверждения.
 * @param {string} options.cancelLabel Подпись кнопки отмены.
 * @returns {Promise<boolean>} `true`, если пользователь подтвердил действие.
 */
export function confirmAction(options) {
  return new Promise((resolve) => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = template(options);

    const dialog = wrapper.querySelector('dialog');

    dialog.addEventListener('click', (event) => {
      // Клик по самому <dialog> — это клик по затемнению вокруг окна.
      const result = event.target === dialog ? 'cancel' : event.target.closest('[data-result]')?.dataset.result;

      if (result) {
        dialog.close(result);
      }
    });

    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'confirm');
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}
