import { canCompleteTask, countOverdue, isPlanComplete } from './onboarding.rules';

const EMP = 'emp-1';
const hr = { id: 'u-hr', roles: ['HR_MANAGER'] as const, employeeId: null };
const employee = { id: 'u-emp', roles: ['EMPLOYEE'] as const, employeeId: EMP };
const otherEmployee = { id: 'u-other', roles: ['EMPLOYEE'] as const, employeeId: 'emp-2' };
const recruiter = { id: 'u-rec', roles: ['RECRUITER'] as const, employeeId: null };
const task = (over: Partial<Parameters<typeof canCompleteTask>[1]> = {}) => ({
  status: 'PENDING' as const,
  assigneeRole: 'EMPLOYEE' as const,
  assigneeId: null,
  ...over,
});

describe('onboarding rules', () => {
  it('lets the employee complete their own EMPLOYEE tasks, not someone else', () => {
    expect(canCompleteTask(employee, task(), EMP)).toBe(true);
    expect(canCompleteTask(otherEmployee, task(), EMP)).toBe(false);
  });

  it('keeps HR tasks for HR, and lets HR Managers complete anything pending', () => {
    expect(canCompleteTask(employee, task({ assigneeRole: 'HR_MANAGER' }), EMP)).toBe(false);
    expect(canCompleteTask(hr, task(), EMP)).toBe(true);
    expect(canCompleteTask(hr, task({ status: 'DONE' }), EMP)).toBe(false);
  });

  it('respects a named assignee over the role', () => {
    const assigned = task({ assigneeRole: 'RECRUITER', assigneeId: 'u-someone' });
    expect(canCompleteTask(recruiter, assigned, EMP)).toBe(false);
    expect(canCompleteTask({ ...recruiter, id: 'u-someone' }, assigned, EMP)).toBe(true);
    expect(canCompleteTask(recruiter, task({ assigneeRole: 'RECRUITER' }), EMP)).toBe(true);
  });

  it('completes a plan when every required task is done', () => {
    expect(
      isPlanComplete([
        { status: 'DONE', required: true },
        { status: 'PENDING', required: false },
      ]),
    ).toBe(true);
    expect(isPlanComplete([{ status: 'PENDING', required: true }])).toBe(false);
  });

  it('counts pending tasks past their due date as overdue', () => {
    const today = new Date('2027-01-10T00:00:00Z');
    expect(
      countOverdue(
        [
          { status: 'PENDING', dueDate: new Date('2027-01-09T00:00:00Z') },
          { status: 'DONE', dueDate: new Date('2027-01-01T00:00:00Z') },
          { status: 'PENDING', dueDate: new Date('2027-01-10T00:00:00Z') },
        ],
        today,
      ),
    ).toBe(1);
  });
});
