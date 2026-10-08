import {
  assertFeedbackEditable,
  assertInFuture,
  assertInterviewScheduled,
  feedbackEditableUntil,
  icsSequence,
} from './interview.rules';

const submitted = new Date('2027-01-10T10:00:00Z');
const hours = (h: number) => new Date(submitted.getTime() + h * 3_600_000);

describe('interview rules', () => {
  it('lets the author edit feedback for 24 hours, then locks it', () => {
    expect(feedbackEditableUntil(submitted)).toEqual(hours(24));
    expect(() => assertFeedbackEditable(submitted, hours(23.9))).not.toThrow();
    expect(() => assertFeedbackEditable(submitted, hours(24.1))).toThrow(
      expect.objectContaining({ code: 'FEEDBACK_LOCKED' }),
    );
  });

  it('only changes scheduled interviews', () => {
    expect(() => assertInterviewScheduled('SCHEDULED')).not.toThrow();
    expect(() => assertInterviewScheduled('CANCELLED')).toThrow(
      expect.objectContaining({ code: 'INTERVIEW_NOT_SCHEDULED' }),
    );
    expect(() => assertInterviewScheduled('COMPLETED')).toThrow();
  });

  it('refuses times in the past beyond a 5-minute grace period', () => {
    expect(() => assertInFuture(hours(-0.05), submitted)).not.toThrow();
    expect(() => assertInFuture(hours(-1), submitted)).toThrow(
      expect.objectContaining({ code: 'INTERVIEW_IN_PAST' }),
    );
  });

  it('increases the calendar sequence over time', () => {
    expect(icsSequence(submitted, submitted)).toBe(0);
    expect(icsSequence(submitted, hours(1))).toBe(3600);
  });
});
