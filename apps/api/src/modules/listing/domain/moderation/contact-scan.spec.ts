import { describe, expect, it } from 'vitest';
import { photoScanFields, scanForContactInfo } from './contact-scan';

describe('scanForContactInfo', () => {
  it('flags a Vietnamese phone number in the description (DoD)', () => {
    const flags = scanForContactInfo({
      description: 'Liên hệ mình qua số 0901234567 để được giảm giá nhé',
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: 'phone', field: 'description', match: '0901234567' });
  });

  it('flags phone numbers written with spaces or dots', () => {
    const spaced = scanForContactInfo({ description: 'call 090 123 4567 now' });
    expect(spaced.some((f) => f.type === 'phone')).toBe(true);

    const dotted = scanForContactInfo({ description: 'z: +84.90.123.4567' });
    expect(dotted.some((f) => f.type === 'phone')).toBe(true);
  });

  it('flags Zalo mentions, emails and external links', () => {
    const flags = scanForContactInfo({
      title: 'Add Zalo for discount',
      description: 'email studio@gmail.com or visit www.mystudio.vn / fb.com/mystudio',
    });
    expect(flags.some((f) => f.type === 'zalo')).toBe(true);
    expect(flags.some((f) => f.type === 'email' && f.match === 'studio@gmail.com')).toBe(true);
    expect(flags.some((f) => f.type === 'url')).toBe(true);
  });

  it('records which field each hit came from', () => {
    const flags = scanForContactInfo({ title: 'Zalo 0901234567', description: null });
    expect(flags.every((f) => f.field === 'title')).toBe(true);
  });

  it('returns no flags for clean marketing copy', () => {
    const flags = scanForContactInfo({
      title: 'Studio ánh sáng tự nhiên 40m2',
      description: 'Không gian rộng rãi, có phòng thay đồ, đặt lịch theo giờ.',
    });
    expect(flags).toEqual([]);
  });

  it('does not treat an ordinary number (area, price) as a phone', () => {
    const flags = scanForContactInfo({ description: 'Rộng 40m2, giá 500000 mỗi giờ' });
    expect(flags.some((f) => f.type === 'phone')).toBe(false);
  });

  it('flags a phone number smuggled into an image filename/metadata (§7.3)', () => {
    const flags = scanForContactInfo({
      title: 'Studio ánh sáng',
      description: 'Không gian rộng rãi',
      ...photoScanFields(['https://cdn.example.com/uploads/call-0901234567.jpg']),
    });
    const hit = flags.find((f) => f.type === 'phone');
    expect(hit).toMatchObject({ type: 'phone', field: 'photo[0]', match: '0901234567' });
  });

  it('scans every photo entry independently', () => {
    const flags = scanForContactInfo(photoScanFields(['clean-cover.jpg', 'zalo-me.png']));
    expect(flags.some((f) => f.type === 'zalo' && f.field === 'photo[1]')).toBe(true);
  });

  /**
   * A photo value is always an absolute URL by contract, and the review checklist
   * requires at least one photo — so flagging the storage URL as an "external
   * link" made EVERY listing unpublishable without `force`. Only the path is
   * scanned (§7.3 means image metadata, not the host the platform issued).
   */
  it('does not flag a listing own storage photo URL as an external link', () => {
    const flags = scanForContactInfo(
      photoScanFields(['https://minio.bookify.vn/listings/studio-a-1.jpg']),
    );
    expect(flags).toEqual([]);
  });

  it('still catches contact info in the filename of a full storage URL', () => {
    const flags = scanForContactInfo(
      photoScanFields(['https://minio.bookify.vn/listings/zalo-0901234567.jpg']),
    );
    expect(flags.map((f) => f.type).sort()).toEqual(['phone', 'zalo']);
    expect(flags.every((f) => f.field === 'photo[0]')).toBe(true);
  });

  it('sees through percent-encoding in a photo path', () => {
    const flags = scanForContactInfo(
      photoScanFields(['https://cdn.example.com/uploads/call%2D0901234567.jpg']),
    );
    expect(flags.some((f) => f.type === 'phone')).toBe(true);
  });

  it('catches an off-platform link smuggled into a photo query string', () => {
    const flags = scanForContactInfo(
      photoScanFields(['https://cdn.example.com/a.jpg?ref=fb.com/mystudio']),
    );
    expect(flags.some((f) => f.type === 'url' && f.match.includes('fb.com'))).toBe(true);
  });
});
