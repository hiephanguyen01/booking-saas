import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

/** Opens an empty tenant-context store for every request; auth fills it in. */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly context: TenantContextService) {}

  use(_req: Request, _res: Response, next: NextFunction) {
    // run() (not enterWith) binds the store for the whole downstream async chain
    // within a fresh context, so a store can never bleed across requests.
    this.context.run({}, () => next());
  }
}
