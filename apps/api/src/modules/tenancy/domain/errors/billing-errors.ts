import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the SubscriptionPlan / TenantSubscription aggregates. Codes +
 * statuses + messages are byte-identical to the pre-refactor use-case behaviour.
 */

export class PlanNotFound extends DomainError {
  constructor(id: string) {
    super('PLAN_NOT_FOUND', 404, `Plan ${id} not found`);
  }
}

export class PlanNameTaken extends DomainError {
  constructor(name: string) {
    super('PLAN_NAME_TAKEN', 409, `Plan name "${name}" is already in use`);
  }
}

/** The update-plan path's answer when a price change would re-price live
 *  subscribers — same code as {@link PlanHasLiveSubscribers} but a different
 *  message (this one explains repricing, that one explains deletion); the two
 *  are NOT interchangeable. */
export class PlanRepricingNeedsConfirmation extends DomainError {
  constructor(subscribers: number) {
    super(
      'PLAN_HAS_SUBSCRIBERS',
      409,
      `Changing this plan's price re-prices ${subscribers} tenant(s) already subscribed ` +
        `to it, because a subscription reads its price from the plan and stores no snapshot. ` +
        `Resend with repriceExistingSubscribers: true to confirm, or create a new plan and ` +
        `migrate tenants to it to leave existing billing untouched.`,
      { subscribers },
    );
  }
}

/** The delete-plan path's answer when live subscribers block deletion — same
 *  code as {@link PlanRepricingNeedsConfirmation} but a different message (this
 *  one explains deletion, that one explains repricing); the two are NOT
 *  interchangeable. */
export class PlanHasLiveSubscribers extends DomainError {
  constructor(subscribers: number) {
    super(
      'PLAN_HAS_SUBSCRIBERS',
      409,
      `Cannot delete a plan with ${subscribers} live subscriber(s). Migrate them to another plan ` +
        `first, or deactivate this one with PATCH { isActive: false } to hide it from new ` +
        `assignments.`,
      { subscribers },
    );
  }
}

export class PlanHasSubscriptionHistory extends DomainError {
  constructor(subscriptions: number) {
    super(
      'PLAN_HAS_SUBSCRIPTION_HISTORY',
      409,
      `Cannot delete a plan that ${subscriptions} past subscription(s) still reference — ` +
        `it would destroy their billing history. Deactivate it with PATCH { isActive: false } ` +
        `instead.`,
      { subscriptions },
    );
  }
}

export class InvalidSubscriptionPeriod extends DomainError {
  constructor() {
    super('INVALID_SUBSCRIPTION_PERIOD', 400, 'expiresAt must be after startsAt');
  }
}

export class NoActivePlan extends DomainError {
  constructor() {
    super('NO_ACTIVE_PLAN', 403, 'Tenant has no active subscription plan');
  }
}

export class PlanLimitReached extends DomainError {
  constructor(key: string, limit: number) {
    super('PLAN_LIMIT_REACHED', 403, `Plan limit reached for ${key} (max ${limit})`);
  }
}

export class PlanFeatureDisabled extends DomainError {
  constructor() {
    super('PLAN_FEATURE_DISABLED', 403, 'The current plan does not include custom domains');
  }
}

export class SubscriptionExpired extends DomainError {
  constructor() {
    super('SUBSCRIPTION_EXPIRED', 403, 'Subscription has expired — the dashboard is read-only');
  }
}
