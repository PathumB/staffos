import { describe, expect, it } from 'vitest';
import { allowedNextStages, isIdentityDocument } from './domain.js';
import { ApplicationStage, DocumentType } from './enums.js';

describe('allowedNextStages', () => {
  it('allows exactly one step forward plus the exits', () => {
    expect(allowedNextStages(ApplicationStage.APPLIED)).toEqual([
      'SCREENING',
      'REJECTED',
      'WITHDRAWN',
    ]);
    expect(allowedNextStages(ApplicationStage.OFFER)).toEqual(['HIRED', 'REJECTED', 'WITHDRAWN']);
  });

  it('never allows skipping stages (e.g. APPLIED → HIRED)', () => {
    expect(allowedNextStages(ApplicationStage.APPLIED)).not.toContain('HIRED');
    expect(allowedNextStages(ApplicationStage.SCREENING)).not.toContain('INTERVIEW');
  });

  it.each([ApplicationStage.HIRED, ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN])(
    'treats %s as terminal',
    (stage) => {
      expect(allowedNextStages(stage)).toEqual([]);
    },
  );
});

describe('isIdentityDocument', () => {
  it('flags passport, visa, Emirates ID and labour card only', () => {
    const identity = Object.values(DocumentType).filter(isIdentityDocument);
    expect(identity.sort()).toEqual(['EMIRATES_ID', 'LABOUR_CARD', 'PASSPORT', 'VISA']);
  });
});
