import { describe, expect, it } from 'vitest';
import { renderEmail } from './email-template';

const data = {
  tenantName: 'StudioHub',
  recipientName: 'An',
  bookingCode: 'BK-7F3K9Q',
  listingTitle: 'Vintage Studio',
  startsAt: '18:00 09/07/2026',
  amount: '600.000 ₫',
  refundAmount: '200.000 ₫',
};

describe('renderEmail', () => {
  it('renders a Vietnamese confirmation with interpolated fields', () => {
    const email = renderEmail('booking_confirmed_customer', 'vi', data);
    expect(email.subject).toBe('Đơn BK-7F3K9Q đã được xác nhận');
    expect(email.text).toContain('Vintage Studio');
    expect(email.text).toContain('18:00 09/07/2026');
    expect(email.html).toContain('<p>');
  });

  it('renders English when the recipient locale is en', () => {
    const email = renderEmail('booking_confirmed_customer', 'en', data);
    expect(email.subject).toBe('Booking BK-7F3K9Q confirmed');
    expect(email.text).toContain('is confirmed');
  });

  it('falls back to Vietnamese for a null/unknown locale', () => {
    expect(renderEmail('booking_completed_customer', null, data).subject).toBe('Cảm ơn bạn đã sử dụng dịch vụ');
    expect(renderEmail('booking_completed_customer', 'fr', data).subject).toBe('Cảm ơn bạn đã sử dụng dịch vụ');
  });

  it('drops missing placeholders cleanly (no leftover braces)', () => {
    const email = renderEmail('booking_rejected_customer', 'en', { tenantName: 'X', recipientName: 'An', bookingCode: 'BK-1' });
    expect(email.text).not.toContain('{');
    expect(email.text).toContain('BK-1');
  });

  it('escapes HTML in interpolated values', () => {
    const email = renderEmail('listing_published_partner', 'en', { tenantName: 'X', recipientName: 'An', listingTitle: '<script>x</script>' });
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
  });
});
