import { toCsv, toPdf, toXlsx } from './report-export';

const table = {
  title: 'Open manpower requests',
  columns: ['Client', 'Role', 'Headcount'],
  rows: [
    ['Gulf "Build", LLC', 'Driver', 3],
    ['=HYPERLINK("http://x")', '+1', null],
  ],
};

describe('report export (US-REP-01)', () => {
  it('writes RFC 4180 CSV and neutralises formula cells', () => {
    expect(toCsv(table)).toBe(
      'Client,Role,Headcount\r\n"Gulf ""Build"", LLC",Driver,3\r\n"\'=HYPERLINK(""http://x"")",\'+1,\r\n',
    );
  });

  it('writes real xlsx and pdf files', async () => {
    expect((await toXlsx(table)).subarray(0, 2).toString()).toBe('PK');
    expect((await toPdf(table, 'All dates')).subarray(0, 4).toString()).toBe('%PDF');
  });
});
