export const LECTURE_STATUSES = ['draft', 'published', 'completed', 'cancelled'] as const;
export const lectureTransitions: Record<(typeof LECTURE_STATUSES)[number], readonly string[]> = {
  draft: ['published', 'cancelled'],
  published: ['draft', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
