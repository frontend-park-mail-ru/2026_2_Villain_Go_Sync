import template from './Modal.hbs';

/**
 * Содержимое окна подтверждения.
 */
interface ConfirmOptions {
  /** Заголовок. */
  title: string;
  /** Текст вопроса. */
  text: string;
  /** Подпись кнопки подтверждения. */
  confirmLabel: string;
  /** Подпись кнопки отмены. */
  cancelLabel: string;
}

/**
 * Показывает модальное окно с вопросом и двумя кнопками.
 * @param options Содержимое окна.
 * @returns `true`, если пользователь подтвердил действие.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = template(options);

    const dialog = wrapper.querySelector('dialog')!;

    dialog.addEventListener('click', (event) => {
      const target = event.target as Element;
      // Клик по самому <dialog> — это клик по затемнению вокруг окна.
      const result = target === dialog ? 'cancel' : target.closest<HTMLElement>('[data-result]')?.dataset.result;

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
