import { BadRequestException, NotFoundException } from '@nestjs/common';

/** Technical HTTP-boundary failures shared by public controllers. */
export class MissingHost extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'MISSING_HOST',
      message: 'Host header is required',
    });
  }
}

export class MissingTenantHost extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'MISSING_HOST',
      message: 'Host header is required to resolve a tenant',
    });
  }
}

/** Hide a disabled development-only route behind the same frozen 404 envelope. */
export class HiddenRouteNotFound extends NotFoundException {
  constructor() {
    super({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
  }
}
