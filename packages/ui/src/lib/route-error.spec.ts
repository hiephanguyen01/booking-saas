import { describe, expect, it } from 'vitest';
import { routeErrorPresentation } from './route-error';

describe('routeErrorPresentation', () => {
  it('maps expected route statuses to safe user-facing copy', () => {
    expect(routeErrorPresentation({ status: 404, statusText: 'Not Found' })).toMatchObject({
      status: 404,
      title: 'Không tìm thấy nội dung',
    });
    expect(routeErrorPresentation({ status: 403, statusText: 'Forbidden' })).toMatchObject({
      status: 403,
      title: 'Bạn không có quyền truy cập',
    });
  });

  it('does not expose stack traces or arbitrary upstream objects', () => {
    const presentation = routeErrorPresentation(
      Object.assign(new Error('database password leaked'), { stack: 'SECRET_STACK' }),
    );

    expect(presentation.status).toBe(500);
    expect(JSON.stringify(presentation)).not.toContain('SECRET');
    expect(JSON.stringify(presentation)).not.toContain('password');
  });
});
