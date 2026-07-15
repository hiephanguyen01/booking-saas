import { describe, expect, it } from 'vitest';
import {
  ModerationError,
  type ModerationState,
  transitionHide,
  transitionPublish,
  transitionRepublish,
  transitionSubmit,
} from './listing-moderation';

const draft: ModerationState = { status: 'draft', publishedBy: null, hiddenBy: null };

describe('listing moderation transitions', () => {
  it('submits a draft for review', () => {
    expect(transitionSubmit(draft)).toEqual({
      status: 'pending_review',
      publishedBy: null,
      hiddenBy: null,
    });
  });

  it('publishes a pending listing and stamps the reviewer', () => {
    const pending: ModerationState = {
      status: 'pending_review',
      publishedBy: null,
      hiddenBy: null,
    };
    expect(transitionPublish(pending, 'admin')).toEqual({
      status: 'published',
      publishedBy: 'admin',
      hiddenBy: null,
    });
  });

  it('refuses to publish a listing that is not in review', () => {
    expect(() => transitionPublish(draft, 'admin')).toThrow(ModerationError);
  });

  it('hides a published listing and records who hid it', () => {
    const published: ModerationState = {
      status: 'published',
      publishedBy: 'admin',
      hiddenBy: null,
    };
    expect(transitionHide(published, 'partner')).toEqual({
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'partner',
    });
  });

  it('escalates the lock when an admin hides a post the partner already hid', () => {
    const hiddenByPartner: ModerationState = {
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'partner',
    };
    // An admin hiding an already-partner-hidden post must stamp hiddenBy=admin so
    // the partner can no longer silently republish it (§7.3 escalate-lock).
    const outcome = transitionHide(hiddenByPartner, 'admin');
    expect(outcome).toEqual({ status: 'archived', publishedBy: 'admin', hiddenBy: 'admin' });
    expect(() => transitionRepublish(outcome, 'partner')).toThrowError(
      expect.objectContaining({ code: 'LISTING_ADMIN_LOCKED' }),
    );
  });

  it('a partner hide never downgrades an existing admin lock', () => {
    const adminHidden: ModerationState = {
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'admin',
    };
    expect(transitionHide(adminHidden, 'partner').hiddenBy).toBe('admin');
  });

  it('lets a partner re-publish a post the partner hid', () => {
    const hiddenByPartner: ModerationState = {
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'partner',
    };
    expect(transitionRepublish(hiddenByPartner, 'partner').status).toBe('published');
  });

  it('BLOCKS a partner from re-publishing an admin-hidden post (domain rule)', () => {
    const adminHidden: ModerationState = {
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'admin',
    };
    expect(() => transitionRepublish(adminHidden, 'partner')).toThrowError(
      expect.objectContaining({ code: 'LISTING_ADMIN_LOCKED' }),
    );
  });

  it('still lets an admin re-publish an admin-hidden post', () => {
    const adminHidden: ModerationState = {
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'admin',
    };
    expect(transitionRepublish(adminHidden, 'admin').status).toBe('published');
  });

  it('BLOCKS a partner from resubmitting an admin-hidden post', () => {
    const adminHidden: ModerationState = {
      status: 'archived',
      publishedBy: 'admin',
      hiddenBy: 'admin',
    };
    expect(() => transitionSubmit(adminHidden)).toThrowError(
      expect.objectContaining({ code: 'LISTING_ADMIN_LOCKED' }),
    );
  });
});
