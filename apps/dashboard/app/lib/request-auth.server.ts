import { AsyncLocalStorage } from 'node:async_hooks';
import type { AdminHostTenantResponse, SessionInfoResponse } from '@booking/contracts';
import type { DashboardSessionData } from './session.server';
import type { DashboardHostResolution } from './tenant-host.server';

export interface DashboardAuthContext {
  user: DashboardSessionData;
  info: SessionInfoResponse;
}

export interface DashboardRequestAuthState {
  auth: DashboardAuthContext | null;
  host: DashboardHostResolution;
  suppressSessionCommit: boolean;
}

const requestAuthStorage = new AsyncLocalStorage<DashboardRequestAuthState>();

export function runWithDashboardRequestAuth<T>(
  state: DashboardRequestAuthState,
  callback: () => T,
): T {
  return requestAuthStorage.run(state, callback);
}

export function getCurrentDashboardAuth(): DashboardAuthContext | null {
  return requestAuthStorage.getStore()?.auth ?? null;
}

export function getCurrentDashboardHost(): DashboardHostResolution {
  const state = requestAuthStorage.getStore();
  if (!state) throw new Error('No Dashboard request auth scope is active.');
  return state.host;
}

export function getCurrentHostTenant(): AdminHostTenantResponse {
  const host = getCurrentDashboardHost();
  if (host.kind !== 'tenant') {
    throw new Error('Host tenant accessed outside a tenant-host request');
  }
  return host.tenant;
}

export function suppressAuthSessionCommit(): void {
  const state = requestAuthStorage.getStore();
  if (!state) {
    throw new Error('No Dashboard request auth scope is active.');
  }
  state.suppressSessionCommit = true;
}
