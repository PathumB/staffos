import { detectFileKind, dueThreshold, maskNumber, sanitizeFileName } from './document.rules';

const file = (originalname: string, head: number[] | string, size = 100) => ({
  originalname,
  size,
  buffer: Buffer.concat([
    typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head),
    Buffer.alloc(16),
  ]),
});

describe('document rules', () => {
  it('detects the real type from magic bytes, not the name', () => {
    expect(detectFileKind(file('cv.pdf', '%PDF-1.7')).ext).toBe('pdf');
    expect(detectFileKind(file('photo.bin', [0x89, 0x50, 0x4e, 0x47])).ext).toBe('png');
    expect(detectFileKind(file('scan.jpeg', [0xff, 0xd8, 0xff, 0xe0])).ext).toBe('jpg');
    expect(detectFileKind(file('letter.docx', [0x50, 0x4b, 0x03, 0x04])).ext).toBe('docx');
  });

  it('refuses executables, renamed zips, empty and oversized files', () => {
    expect(() => detectFileKind(file('evil.pdf', 'MZ\x90\x00'))).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE' }),
    );
    expect(() => detectFileKind(file('archive.zip', [0x50, 0x4b, 0x03, 0x04]))).toThrow();
    expect(() => detectFileKind(file('empty.pdf', '%PDF-', 0))).toThrow();
    expect(() => detectFileKind(file('big.pdf', '%PDF-', 10 * 1024 * 1024 + 1))).toThrow(/10 MB/);
    expect(() => detectFileKind(undefined)).toThrow();
  });

  it('sanitises file names', () => {
    expect(sanitizeFileName('..\\..\\etc/passwd<script>.pdf', 'pdf')).toBe('passwdscript.pdf');
    expect(sanitizeFileName('C:\\Users\\me\\cv.pdf', 'pdf')).toBe('cv.pdf');
    expect(sanitizeFileName('Passport  scan (1).PNG', 'png')).toBe('Passport scan 1.png');
    expect(sanitizeFileName('???.pdf', 'pdf')).toBe('document.pdf');
  });

  it('masks document numbers', () => {
    expect(maskNumber('A12345678')).toBe('••••5678');
    expect(maskNumber('123')).toBe('••••');
    expect(maskNumber(null)).toBeNull();
  });

  it('picks the smallest threshold reached', () => {
    const today = new Date('2027-01-01T00:00:00Z');
    const inDays = (n: number) => new Date(today.getTime() + n * 86_400_000);
    expect(dueThreshold(inDays(45), today)).toBeNull();
    expect(dueThreshold(inDays(30), today)).toBe(30);
    expect(dueThreshold(inDays(12), today)).toBe(30);
    expect(dueThreshold(inDays(7), today)).toBe(7);
    expect(dueThreshold(inDays(-3), today)).toBe(7);
  });
});
