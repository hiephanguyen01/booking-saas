import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export class NoPermissionDeclared extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: 'NO_PERMISSION_DECLARED',
      message: 'Route declares no permissions and is denied by default',
    });
  }
}

export class MissingPermission extends ForbiddenException {
  constructor(missing: string[]) {
    super({
      statusCode: 403,
      code: 'MISSING_PERMISSION',
      message: `Missing permission: ${missing.join(', ')}`,
    });
  }
}

export class NotAuthenticated extends UnauthorizedException {
  constructor() {
    super({
      statusCode: 401,
      code: 'NOT_AUTHENTICATED',
      message: 'Authentication required',
    });
  }
}

export class SessionExpired extends UnauthorizedException {
  constructor() {
    super({
      statusCode: 401,
      code: 'SESSION_EXPIRED',
      message: 'Session is invalid or expired',
    });
  }
}
