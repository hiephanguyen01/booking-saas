import { describe, expect, it } from 'vitest';
import { readSource, repoPath } from './support/repo';

describe('request logging security', () => {
  it('redacts booking bearer credentials from request headers', () => {
    const appModule = readSource(repoPath('apps/api/src/app.module.ts'));

    expect(appModule).toContain(`'req.headers["x-booking-access-grant"]'`);
    expect(appModule).toContain(`'req.headers["x-booking-otp"]'`);
  });
});
