import type { ModerationActor, PublishStatus } from '@booking/contracts';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Post moderation state machine (TONG-QUAN.md §7.3). A post/standalone listing
 * flows `draft → pending_review → published`, and can be hidden to `archived`.
 * The load-bearing domain rule: a post **hidden by an admin cannot be
 * re-published by the partner** — only an admin can unlock it. Pure and
 * framework-free; typed `DomainError`s are translated by the global filter.
 */

export interface ModerationState {
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
}

export interface ModerationOutcome {
  status: PublishStatus;
  publishedBy: ModerationActor | null;
  hiddenBy: ModerationActor | null;
}

export class ModerationError extends DomainError {
  constructor(code: string, message: string) {
    super(code, code === 'LISTING_ADMIN_LOCKED' ? 403 : 400, message);
  }
}

/** draft/archived → pending_review. Admin-locked posts cannot be resubmitted. */
export function transitionSubmit(state: ModerationState): ModerationOutcome {
  if (state.status === 'pending_review') {
    return { status: 'pending_review', publishedBy: state.publishedBy, hiddenBy: state.hiddenBy };
  }
  if (state.status === 'published') {
    throw new ModerationError('LISTING_ALREADY_PUBLISHED', 'Listing is already published');
  }
  assertNotAdminLocked(state, 'partner');
  return { status: 'pending_review', publishedBy: state.publishedBy, hiddenBy: state.hiddenBy };
}

/** pending_review → published (reviewer). Clears any prior hide. */
export function transitionPublish(
  state: ModerationState,
  actor: ModerationActor,
): ModerationOutcome {
  if (state.status !== 'pending_review') {
    throw new ModerationError(
      'LISTING_NOT_IN_REVIEW',
      `A listing can only be published from pending_review (was ${state.status})`,
    );
  }
  return { status: 'published', publishedBy: actor, hiddenBy: null };
}

/**
 * published/pending_review → archived (hidden). Records who hid it.
 *
 * Only visible/reviewable posts can be hidden. An admin hide records an admin
 * lock; a partner hide records a partner lock. An archived post must use the
 * republish/resubmit transitions instead of being hidden again.
 */
export function transitionHide(state: ModerationState, actor: ModerationActor): ModerationOutcome {
  if (state.status !== 'pending_review' && state.status !== 'published') {
    throw new ModerationError(
      'LISTING_NOT_HIDEABLE',
      `A listing can only be hidden from pending_review or published (was ${state.status})`,
    );
  }
  const hiddenBy: ModerationActor =
    actor === 'admin' || state.hiddenBy === 'admin' ? 'admin' : actor;
  return { status: 'archived', publishedBy: state.publishedBy, hiddenBy };
}

/** archived → published. A partner cannot re-publish an admin-hidden post. */
export function transitionRepublish(
  state: ModerationState,
  actor: ModerationActor,
): ModerationOutcome {
  if (state.status !== 'archived') {
    throw new ModerationError(
      'LISTING_NOT_ARCHIVED',
      `Only an archived listing can be re-published (was ${state.status})`,
    );
  }
  assertNotAdminLocked(state, actor);
  return { status: 'published', publishedBy: actor, hiddenBy: null };
}

/** The lockout invariant, shared by submit + republish. */
function assertNotAdminLocked(state: ModerationState, actor: ModerationActor): void {
  if (state.hiddenBy === 'admin' && actor !== 'admin') {
    throw new ModerationError(
      'LISTING_ADMIN_LOCKED',
      'This post was hidden by an admin and can only be re-published by an admin',
    );
  }
}
