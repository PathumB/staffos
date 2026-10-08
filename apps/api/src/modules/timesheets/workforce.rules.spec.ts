import {
  assertTimesheetDates,
  deploymentStatusOn,
  initialDeploymentStatus,
  nextTimesheetStatus,
} from './workforce.rules';

const dep = { startDate: '2027-01-06', endDate: '2027-01-20' }; // Wednesday to Wednesday

describe('workforce rules', () => {
  it('starts deployments as planned or active and moves them on with the calendar', () => {
    expect(initialDeploymentStatus('2027-02-01', '2027-01-15')).toBe('PLANNED');
    expect(initialDeploymentStatus('2027-01-15', '2027-01-15')).toBe('ACTIVE');
    expect(deploymentStatusOn({ status: 'PLANNED', ...dep }, '2027-01-06')).toBe('ACTIVE');
    expect(deploymentStatusOn({ status: 'ACTIVE', ...dep }, '2027-01-21')).toBe('ENDED');
    expect(deploymentStatusOn({ status: 'ACTIVE', ...dep }, '2027-01-20')).toBeNull();
    expect(
      deploymentStatusOn(
        { status: 'ACTIVE', startDate: dep.startDate, endDate: null },
        '2030-01-01',
      ),
    ).toBeNull();
  });

  it('accepts entries inside both the week and the deployment', () => {
    expect(() =>
      assertTimesheetDates('2027-01-04', [{ date: '2027-01-06' }, { date: '2027-01-10' }], dep),
    ).not.toThrow();
  });

  it('rejects non-Monday weeks, weeks outside the deployment and stray days (400)', () => {
    expect(() => assertTimesheetDates('2027-01-05', [], dep)).toThrow(
      expect.objectContaining({ code: 'INVALID_WEEK' }),
    );
    expect(() => assertTimesheetDates('2027-01-25', [], dep)).toThrow(
      expect.objectContaining({ code: 'WEEK_OUTSIDE_DEPLOYMENT' }),
    );
    // Monday 4 January is in the week but before the deployment started.
    expect(() => assertTimesheetDates('2027-01-04', [{ date: '2027-01-04' }], dep)).toThrow(
      expect.objectContaining({ code: 'INVALID_ENTRY_DATE' }),
    );
    expect(() => assertTimesheetDates('2027-01-04', [{ date: '2027-01-11' }], dep)).toThrow(
      expect.objectContaining({ code: 'INVALID_ENTRY_DATE' }),
    );
  });

  it('follows the timesheet lifecycle', () => {
    expect(nextTimesheetStatus('DRAFT', 'submit')).toBe('SUBMITTED');
    expect(nextTimesheetStatus('REJECTED', 'submit')).toBe('SUBMITTED');
    expect(nextTimesheetStatus('SUBMITTED', 'approve')).toBe('APPROVED');
    expect(nextTimesheetStatus('SUBMITTED', 'reject')).toBe('REJECTED');
    expect(() => nextTimesheetStatus('APPROVED', 'reject')).toThrow(
      expect.objectContaining({ code: 'INVALID_TIMESHEET_TRANSITION' }),
    );
    expect(() => nextTimesheetStatus('DRAFT', 'approve')).toThrow();
  });
});
