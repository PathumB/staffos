import { addDays, employeeNumber, isJobFilled, planTasksFromTemplate } from './hire.rules';

describe('hire rules', () => {
  it('formats employee numbers', () => {
    expect(employeeNumber(1001n)).toBe('EMP-001001');
    expect(employeeNumber(1234567)).toBe('EMP-1234567');
  });

  it('copies template tasks in order with due dates from the start date', () => {
    const start = new Date('2027-02-01T00:00:00Z');
    const tasks = planTasksFromTemplate(
      [
        {
          title: 'Induction',
          description: null,
          type: 'INDUCTION',
          assigneeRole: 'HR_MANAGER',
          dueOffsetDays: 1,
          required: true,
          sortOrder: 2,
        },
        {
          title: 'Visa',
          description: 'Entry permit',
          type: 'VISA',
          assigneeRole: 'HR_MANAGER',
          dueOffsetDays: -10,
          required: true,
          sortOrder: 1,
        },
      ],
      start,
    );
    expect(tasks.map((t) => t.title)).toEqual(['Visa', 'Induction']);
    expect(tasks[0]!.dueDate).toEqual(new Date('2027-01-22T00:00:00Z'));
    expect(tasks[1]!.dueDate).toEqual(addDays(start, 1));
    expect(tasks.map((t) => t.sortOrder)).toEqual([0, 1]);
  });

  it('fills a job when hires reach the headcount', () => {
    expect(isJobFilled(2, 3)).toBe(false);
    expect(isJobFilled(3, 3)).toBe(true);
  });
});
