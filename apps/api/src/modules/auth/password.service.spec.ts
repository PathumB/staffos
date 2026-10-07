import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const user = { email: 'noor.saleh@client.test', firstName: 'Noor', lastName: 'Saleh' };

  it('hashes with argon2id and verifies', async () => {
    const hash = await service.hash('Blue-Dhow-Harbour-19');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hash, 'Blue-Dhow-Harbour-19')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong')).resolves.toBe(false);
    await expect(service.verify('not-a-hash', 'x')).resolves.toBe(false);
    expect(service.needsRehash(hash)).toBe(false);
  });

  it.each([
    ['too short', 'Short-1'],
    ['a common password', 'password1234'],
    ['the user’s name', 'NoorIsTheBest2026'],
    ['the email local part', 'noor.saleh-2026!'],
  ])('rejects %s', (_label, password) => {
    expect(() => service.assertAcceptable(password, 'password', user)).toThrow(
      'Request validation failed.',
    );
  });

  it('accepts a long, unrelated passphrase', () => {
    expect(() => service.assertAcceptable('Blue-Dhow-Harbour-19', 'password', user)).not.toThrow();
  });
});
