import { describe, expect, it } from 'vitest';
import { partnerSlugFor } from './partner-onboarding.server';

describe('partnerSlugFor', () => {
  it('normalizes Vietnamese names and adds a stable user suffix', () => {
    expect(partnerSlugFor('Studio Ánh Sáng Đẹp', '019f61bf-bd95-78d0-8e95-03732978ccf5')).toBe(
      'studio-anh-sang-dep-019f61bf',
    );
    expect(partnerSlugFor('Studio Ánh Sáng Đẹp', '019f61bf-bd95-78d0-8e95-03732978ccf5')).toBe(
      'studio-anh-sang-dep-019f61bf',
    );
  });
});
