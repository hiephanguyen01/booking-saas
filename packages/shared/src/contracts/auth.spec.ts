import { describe, expect, it } from 'vitest';
import { loginInputSchema, registerInputSchema } from './auth';

describe('auth contracts', () => {
  it('accepts a valid registration and lowercases the email', () => {
    const parsed = registerInputSchema.parse({
      email: 'Anh@Example.COM',
      password: 'super-secret-1',
      fullName: 'Nguyen Van Anh',
    });
    expect(parsed.email).toBe('anh@example.com');
    expect(parsed.locale).toBe('vi');
  });

  it('rejects a short password', () => {
    const result = registerInputSchema.safeParse({
      email: 'a@b.com',
      password: 'short',
      fullName: 'A',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a login without an email', () => {
    expect(loginInputSchema.safeParse({ password: 'x' }).success).toBe(false);
  });
});
