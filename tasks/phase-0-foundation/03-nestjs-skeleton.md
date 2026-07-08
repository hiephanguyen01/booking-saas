# Task 0.3 — NestJS skeleton + hexagonal conventions

**Phase:** 0 — Foundation · **Depends on:** 0.1, 0.2 · **Design refs:** TONG-QUAN.md §5

## Goal
The API app boots with the module layout and dependency rules the whole project will follow.

## Scope
- [ ] NestJS app with module folders: identity-access, tenancy, catalog, scheduling, booking, payments, finance, notification (affiliate deferred)
- [ ] Hexagonal layout per module: `domain/` (pure TS), `application/` (use cases + ports), `infrastructure/` (adapters), `interface/` (controllers, DTO)
- [ ] Dependency rule enforced (lint rule or convention doc): interface → application → domain; infrastructure implements application ports; domain never imports Nest/Prisma
- [ ] Health checks: `/health` (liveness) + `/health/ready` (DB/Redis)

## Definition of Done
- API boots against docker-compose infra; health endpoints respond; a sample domain unit test runs without DB
