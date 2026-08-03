import type { EmotionMoment, EmotionNote } from '../types';

export const migrateLegacyHiddenDefaults = (
  sourceVersion: number,
  moments: EmotionMoment[],
  notes: EmotionNote[],
  issues: string[],
) => {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  if (sourceVersion < 3) {
    for (const moment of moments) {
      const note = noteById.get(moment.noteId);
      const hiddenDraft = moment.isNew === true || note?.isDraft === true;
      if (hiddenDraft && (moment.emotion === 'tender' || moment.emotion === 'mixed')) {
        moment.emotion = null;
        moment.intensity = 0;
        issues.push('legacy-hidden-emotion-cleared');
      }
      if (hiddenDraft && moment.placeRating === 'neutral') {
        moment.placeRating = null;
        issues.push('legacy-hidden-place-rating-cleared');
      }
      moment.eventTimeSource ??= 'legacy';
      if (note) {
        note.emotion = moment.emotion;
        note.placeRating = moment.placeRating;
      }
    }
  }
  return noteById;
};
