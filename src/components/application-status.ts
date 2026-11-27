/** Этапы отклика из текущего API и ранее созданных записей. */
export const applicationStatuses: Record<string, { type: string; label: string; event?: string }> = {
  pending: { type: 'new', label: 'Новый' },
  created: { type: 'new', label: 'Новый' },
  reviewing: { type: 'viewed', label: 'Рассмотрение', event: 'Начато рассмотрение' },
  offer: { type: 'accepted', label: 'Предложение', event: 'Переведён на этап предложения' },
  viewed: { type: 'viewed', label: 'Просмотрен', event: 'Отклик просмотрен' },
  interview: { type: 'interview', label: 'Собеседование', event: 'Переведён на этап собеседования' },
  accepted: { type: 'accepted', label: 'Принят', event: 'Кандидат принят' },
  rejected: { type: 'rejected', label: 'Отклонён', event: 'Кандидату отказано' },
};
