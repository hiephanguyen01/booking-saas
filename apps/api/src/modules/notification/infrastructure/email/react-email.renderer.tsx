import { Injectable } from '@nestjs/common';
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
  render,
  toPlainText,
} from 'react-email';
import path from 'node:path';
import type {
  EmailAttachment,
  EmailBrand,
  EmailContent,
  Locale,
  TemplateData,
} from '../../domain/email-template';
import { normalizeLocale } from '../../domain/email-template';
import type {
  EmailTemplateId,
  IEmailRenderer,
} from '../../domain/ports/email-renderer.port';
import {
  BOOKING_EMAIL_CIDS,
  BookingCustomerEmail,
  isBookingCustomerTemplate,
} from './booking-customer-email';
import { AuthOtpEmail } from './auth-otp-email';

const NEUTRAL_900 = '#101828';
const NEUTRAL_600 = '#475467';
const NEUTRAL_300 = '#D0D5DD';
const NEUTRAL_100 = '#F2F4F7';
const BODY_BG = '#EAECF0';

type Copy = {
  subject: string;
  title: string;
  intro: string;
  cta?: string;
  status?: string;
  statusIcon?: keyof typeof STATUS_ASSETS;
};

const STATUS_ASSETS = {
  confirmed: { filename: 'booking-confirmed.svg', cid: 'booking-confirmed@bookingos' },
  cancelled: { filename: 'booking-cancelled.svg', cid: 'booking-cancelled@bookingos' },
  refunded: { filename: 'booking-refunded.svg', cid: 'booking-refunded@bookingos' },
  noShow: { filename: 'booking-no-show.svg', cid: 'booking-no-show@bookingos' },
} as const;

const SUPPORTING_ASSETS = {
  calendar: { filename: 'calendar.svg', cid: BOOKING_EMAIL_CIDS.calendar },
  policyCheck: { filename: 'policy-check.svg', cid: BOOKING_EMAIL_CIDS.policyCheck },
} as const;

const COPY: Record<EmailTemplateId, Record<Locale, Copy>> = {
  legal_document_published_partner: {
    vi: { subject: 'Điều khoản Đối tác vừa có phiên bản mới', title: 'Điều khoản Đối tác đã được cập nhật', intro: 'Phiên bản {legalVersionNo} của Điều khoản Đối tác tại {tenantName} đã có hiệu lực. Bạn có thể cần chấp thuận lại điều khoản này trước khi thực hiện thao tác tiếp theo.', cta: 'Xem điều khoản mới' },
    en: { subject: 'Partner Terms has a new version', title: 'The Partner Terms were updated', intro: 'Version {legalVersionNo} of the Partner Terms at {tenantName} is now in effect. You may need to accept it again before your next action.', cta: 'View the new terms' },
  },
  legal_document_published_affiliate: {
    vi: { subject: 'Điều khoản Cộng tác viên vừa có phiên bản mới', title: 'Điều khoản Cộng tác viên đã được cập nhật', intro: 'Phiên bản {legalVersionNo} của Điều khoản Cộng tác viên tại {tenantName} đã có hiệu lực. Bạn có thể cần chấp thuận lại điều khoản này trước khi thực hiện thao tác tiếp theo.', cta: 'Xem điều khoản mới' },
    en: { subject: 'Affiliate Terms has a new version', title: 'The Affiliate Terms were updated', intro: 'Version {legalVersionNo} of the Affiliate Terms at {tenantName} is now in effect. You may need to accept it again before your next action.', cta: 'View the new terms' },
  },
  booking_pending_approval_partner: {
    vi: { subject: 'Đơn đặt mới {bookingCode} cần duyệt', title: 'Bạn có đơn đặt mới', intro: 'Đơn {bookingCode} cho “{listingTitle}” lúc {startsAt} đang chờ duyệt.', cta: 'Xem đơn đặt' },
    en: { subject: 'New booking {bookingCode} needs approval', title: 'You have a new booking', intro: 'Booking {bookingCode} for “{listingTitle}” at {startsAt} is waiting for approval.', cta: 'Review booking' },
  },
  booking_approved_customer: {
    vi: { subject: 'Đơn {bookingCode} đã được duyệt', title: 'Đơn của quý khách đã được duyệt', intro: 'Vui lòng thanh toán {amount} để xác nhận đơn {bookingCode}.', cta: 'Thanh toán đơn' },
    en: { subject: 'Booking {bookingCode} approved', title: 'Your booking was approved', intro: 'Please pay {amount} to confirm booking {bookingCode}.', cta: 'Pay booking' },
  },
  booking_confirmed_customer: {
    vi: { subject: 'Xác nhận đơn đặt với {tenantName} - Mã Booking: {bookingCode}', title: 'Đơn của quý khách đã được xác nhận!', intro: 'Mã booking của quý khách là {bookingCode}. Quý khách có thể theo dõi và quản lý đơn trên nền tảng.', cta: 'Đơn đặt của tôi', status: 'Đã xác nhận', statusIcon: 'confirmed' },
    en: { subject: 'Booking confirmed with {tenantName} - Booking: {bookingCode}', title: 'Your booking is confirmed!', intro: 'Your booking code is {bookingCode}. You can track and manage it on the platform.', cta: 'View my booking', status: 'Confirmed', statusIcon: 'confirmed' },
  },
  booking_confirmed_partner: {
    vi: { subject: 'Đơn {bookingCode} đã thanh toán', title: 'Đơn đặt đã được xác nhận', intro: 'Đơn {bookingCode} cho “{listingTitle}” lúc {startsAt} đã được thanh toán và xác nhận.', cta: 'Xem đơn đặt' },
    en: { subject: 'Booking {bookingCode} paid', title: 'Booking confirmed', intro: 'Booking {bookingCode} for “{listingTitle}” at {startsAt} has been paid and confirmed.', cta: 'View booking' },
  },
  booking_cancelled_customer: {
    vi: { subject: 'Đã huỷ đơn đặt - Mã Booking: {bookingCode}', title: 'Đơn của quý khách đã được hủy', intro: 'Xác nhận hủy đơn {bookingCode}. Khoản hoàn tiền, nếu có, sẽ được xử lý theo chính sách áp dụng.', cta: 'Đơn đặt của tôi', status: 'Đã hủy', statusIcon: 'cancelled' },
    en: { subject: 'Booking cancelled - Booking: {bookingCode}', title: 'Your booking was cancelled', intro: 'Booking {bookingCode} has been cancelled. Any eligible refund will be processed under the applicable policy.', cta: 'View my booking', status: 'Cancelled', statusIcon: 'cancelled' },
  },
  booking_cancelled_partner: {
    vi: { subject: 'Đơn {bookingCode} đã bị hủy', title: 'Đơn đặt đã bị hủy', intro: 'Đơn {bookingCode} cho “{listingTitle}” lúc {startsAt} đã bị hủy.', cta: 'Xem đơn đặt' },
    en: { subject: 'Booking {bookingCode} cancelled', title: 'Booking cancelled', intro: 'Booking {bookingCode} for “{listingTitle}” at {startsAt} was cancelled.', cta: 'View booking' },
  },
  booking_refunded_customer: {
    vi: { subject: 'Xác nhận hoàn tiền - Mã Booking: {bookingCode}', title: 'Xác nhận hoàn tiền', intro: 'Đơn {bookingCode} đã được hoàn tiền thành công.', cta: 'Đơn đặt của tôi', status: 'Đã hoàn tiền', statusIcon: 'refunded' },
    en: { subject: 'Refund confirmed - Booking: {bookingCode}', title: 'Refund confirmed', intro: 'The refund for booking {bookingCode} was completed successfully.', cta: 'View my booking', status: 'Refunded', statusIcon: 'refunded' },
  },
  booking_refunded_partner: {
    vi: { subject: 'Đơn {bookingCode} đã hoàn tiền', title: 'Hoàn tiền đã hoàn tất', intro: 'Khoản hoàn tiền cho đơn {bookingCode} đã được xử lý thành công.', cta: 'Xem đơn đặt' },
    en: { subject: 'Booking {bookingCode} refunded', title: 'Refund completed', intro: 'The refund for booking {bookingCode} has been completed.', cta: 'View booking' },
  },
  booking_completed_customer: {
    vi: { subject: 'Cảm ơn bạn đã sử dụng dịch vụ', title: 'Đơn đặt đã hoàn tất', intro: 'Cảm ơn bạn đã đặt dịch vụ với {tenantName}.', cta: 'Xem đơn đặt' },
    en: { subject: 'Thanks for your booking', title: 'Booking completed', intro: 'Thank you for booking with {tenantName}.', cta: 'View booking' },
  },
  booking_auto_completed_partner: {
    vi: { subject: 'Đơn {bookingCode} đã tự động hoàn tất', title: 'Hệ thống đã hoàn tất đơn thay bạn', intro: 'Đơn {bookingCode} cho “{listingTitle}” đã quá 24 giờ kể từ khi kết thúc mà chưa được xác nhận, nên hệ thống tự chuyển sang hoàn tất. Phần tiền còn lại được ghi nhận là bạn đã thu tại chỗ, và cửa sổ khiếu nại của khách đã bắt đầu chạy.', cta: 'Xem đơn đặt' },
    en: { subject: 'Booking {bookingCode} was completed automatically', title: 'We completed this booking for you', intro: 'Booking {bookingCode} for “{listingTitle}” went 24 hours past its end without being confirmed, so the system completed it. The outstanding balance is recorded as collected on site, and the customer’s dispute window has started.', cta: 'View booking' },
  },
  booking_no_show_customer: {
    vi: { subject: 'Xác nhận Vắng mặt - Mã Booking: {bookingCode}', title: 'Quý khách không thực hiện đơn', intro: 'Xác nhận vắng mặt đơn {bookingCode}. Việc hoàn tiền được áp dụng theo chính sách của đơn.', cta: 'Đơn đặt của tôi', status: 'Vắng mặt', statusIcon: 'noShow' },
    en: { subject: 'No-show recorded - Booking: {bookingCode}', title: 'Booking marked as no-show', intro: 'Booking {bookingCode} has been marked as a no-show. Refund eligibility follows the booking policy.', cta: 'View my booking', status: 'No-show', statusIcon: 'noShow' },
  },
  booking_rejected_customer: {
    vi: { subject: 'Đơn {bookingCode} đã bị từ chối', title: 'Đơn đặt không được chấp nhận', intro: 'Rất tiếc, đơn {bookingCode} đã bị từ chối. {reason}', cta: 'Xem đơn đặt' },
    en: { subject: 'Booking {bookingCode} declined', title: 'Booking declined', intro: 'Unfortunately, booking {bookingCode} was declined. {reason}', cta: 'View booking' },
  },
  booking_reminder_customer: {
    vi: { subject: 'Nhắc lịch: đơn {bookingCode} sắp tới', title: 'Lịch đặt của quý khách sắp tới', intro: 'Đơn {bookingCode} cho “{listingTitle}” bắt đầu lúc {startsAt}.', cta: 'Xem đơn đặt' },
    en: { subject: 'Reminder: booking {bookingCode} is coming up', title: 'Your booking is coming up', intro: 'Booking {bookingCode} for “{listingTitle}” starts at {startsAt}.', cta: 'View booking' },
  },
  booking_otp_customer: {
    vi: { subject: 'Mã xác thực đơn {bookingCode}', title: 'Mã xác minh email của bạn', intro: 'Dùng mã này để xác minh và truy cập đơn {bookingCode} trên {tenantName}.' },
    en: { subject: 'Verification code for booking {bookingCode}', title: 'Your email verification code', intro: 'Use this code to verify and access booking {bookingCode} on {tenantName}.' },
  },
  listing_published_partner: {
    vi: { subject: 'Tin “{listingTitle}” đã được duyệt', title: 'Tin của bạn đã được duyệt', intro: 'Tin “{listingTitle}” đã được hiển thị công khai.', cta: 'Xem tin' },
    en: { subject: 'Listing “{listingTitle}” is live', title: 'Your listing is live', intro: '“{listingTitle}” has been approved and is now public.', cta: 'View listing' },
  },
  listing_hidden_partner: {
    vi: { subject: 'Tin “{listingTitle}” đã bị ẩn', title: 'Tin của bạn đã bị ẩn', intro: 'Tin “{listingTitle}” đã bị ẩn. {reason}', cta: 'Xem tin' },
    en: { subject: 'Listing “{listingTitle}” was hidden', title: 'Your listing was hidden', intro: '“{listingTitle}” was hidden. {reason}', cta: 'View listing' },
  },
  listing_change_approved_partner: {
    vi: { subject: 'Thay đổi cho tin “{listingTitle}” đã được duyệt', title: 'Thay đổi đã được duyệt', intro: 'Thay đổi bạn gửi cho tin “{listingTitle}” đã được duyệt và đang hiển thị.', cta: 'Xem tin' },
    en: { subject: 'Your change to “{listingTitle}” was approved', title: 'Change approved', intro: 'The change you submitted for “{listingTitle}” has been approved and is now live.', cta: 'View listing' },
  },
  listing_change_rejected_partner: {
    vi: { subject: 'Thay đổi cho tin “{listingTitle}” chưa được duyệt', title: 'Thay đổi chưa được duyệt', intro: 'Thay đổi bạn gửi cho tin “{listingTitle}” chưa được duyệt. {reason} Tin vẫn đang hiển thị bản đã duyệt trước đó.', cta: 'Sửa lại tin' },
    en: { subject: 'Your change to “{listingTitle}” was not approved', title: 'Change not approved', intro: 'The change you submitted for “{listingTitle}” was turned down. {reason} The listing keeps serving its previously approved content.', cta: 'Edit listing' },
  },
  partner_application_received: {
    vi: { subject: 'Đã nhận hồ sơ đối tác tại {tenantName}', title: 'Hồ sơ đối tác đã được ghi nhận', intro: 'Chào {recipientName}, hồ sơ “{partnerName}” đã được gửi thành công và đang chờ tenant duyệt.', cta: 'Tài khoản của tôi' },
    en: { subject: 'Partner application received by {tenantName}', title: 'Partner application received', intro: 'Hi {recipientName}, the application for “{partnerName}” was submitted and is awaiting tenant approval.', cta: 'Open my account' },
  },
  partner_approved: {
    vi: { subject: 'Xác nhận hoàn tất đăng ký tài khoản đối tác', title: 'Bạn đã đăng ký thành công Tài khoản Đối tác!', intro: 'Hồ sơ “{partnerName}” tại {tenantName} đã được duyệt. Bạn có thể bắt đầu quản lý dịch vụ, lịch và giá.', cta: 'Tài khoản của tôi' },
    en: { subject: 'Partner account registration completed', title: 'Your partner account is ready!', intro: '“{partnerName}” at {tenantName} was approved. You can now manage services, availability and pricing.', cta: 'Open my account' },
  },
  partner_agreement_recorded: {
    vi: { subject: 'Thỏa thuận đối tác đã được ghi nhận', title: 'Thỏa thuận Đối tác', intro: 'Các phiên bản thỏa thuận áp dụng cho “{partnerName}” đã được ghi nhận khi hồ sơ được phê duyệt. Đây không phải tuyên bố ký điện tử.', cta: 'Xem bản ghi thỏa thuận' },
    en: { subject: 'Partner agreements recorded', title: 'Partner agreements', intro: 'The agreement versions applicable to “{partnerName}” were recorded when the application was approved. This is not a representation of an electronic signature.', cta: 'View agreement record' },
  },
  payout_paid_partner: {
    vi: { subject: 'Đã chi trả {amount}', title: 'Khoản chi trả đã được gửi', intro: '{tenantName} đã gửi khoản chi trả {amount}. Vui lòng kiểm tra tài khoản nhận tiền.' },
    en: { subject: 'Payout of {amount} sent', title: 'Payout sent', intro: '{tenantName} sent a payout of {amount}. Please check your payout account.' },
  },
  tax_certificate_issued_partner: {
    vi: { subject: 'Đã phát hành chứng từ khấu trừ thuế {certificateNumber}', title: 'Bạn có chứng từ khấu trừ thuế mới', intro: '{tenantName} đã phát hành chứng từ {certificateNumber} cho năm {taxYear}. Bạn có thể xem PDF an toàn trong trang Doanh thu.', cta: 'Xem chứng từ' },
    en: { subject: 'Tax withholding certificate {certificateNumber} issued', title: 'Your tax withholding certificate is ready', intro: '{tenantName} issued certificate {certificateNumber} for tax year {taxYear}. You can securely view the PDF from Revenue.', cta: 'View certificate' },
  },
  tax_certificate_voided_partner: {
    vi: { subject: 'Đã huỷ chứng từ khấu trừ thuế {certificateNumber}', title: 'Chứng từ khấu trừ thuế đã bị huỷ', intro: '{tenantName} đã huỷ chứng từ {certificateNumber} của năm {taxYear}. Lý do: {reason}', cta: 'Xem lịch sử chứng từ' },
    en: { subject: 'Tax withholding certificate {certificateNumber} voided', title: 'A tax withholding certificate was voided', intro: '{tenantName} voided certificate {certificateNumber} for tax year {taxYear}. Reason: {reason}', cta: 'View certificate history' },
  },
  auth_registration_otp: {
    vi: { subject: 'Mã xác thực để xác minh đăng ký', title: 'Xác thực email', intro: 'Dùng mã bên dưới để xác minh địa chỉ email {recipientEmail}.', cta: 'Xác thực email' },
    en: { subject: 'Your registration verification code', title: 'Verify your email', intro: 'Use the code below to verify {recipientEmail}.', cta: 'Verify email' },
  },
  auth_password_reset_otp: {
    vi: { subject: 'Mã xác thực để đặt lại mật khẩu', title: 'Đặt lại mật khẩu', intro: 'Dùng mã bên dưới để tiếp tục đặt lại mật khẩu cho {recipientEmail}.', cta: 'Nhập mã xác thực' },
    en: { subject: 'Your password reset code', title: 'Reset your password', intro: 'Use the code below to continue resetting the password for {recipientEmail}.', cta: 'Enter verification code' },
  },
};

function interpolate(template: string, data: TemplateData): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = data[key as keyof TemplateData];
    return value == null ? '' : String(value);
  }).replace(/\s+/g, ' ').trim();
}

function safeLogo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Row style={{ borderBottom: `1px solid ${NEUTRAL_100}` }}>
      <Column style={{ padding: '12px 0', color: NEUTRAL_600, fontSize: '13px', width: '38%' }}>{label}</Column>
      <Column style={{ padding: '12px 0', color: NEUTRAL_900, fontSize: '13px', fontWeight: 600, textAlign: 'right' }}>{value}</Column>
    </Row>
  );
}

function OtpCard({ otp, expiresInMin, locale }: { otp: string; expiresInMin: number; locale: Locale }) {
  return (
    <Section style={{ background: '#FFF5C5', borderRadius: '12px', padding: '24px', textAlign: 'center', margin: '24px 0' }}>
      <Text style={{ color: NEUTRAL_600, fontSize: '14px', margin: 0 }}>{locale === 'vi' ? 'Mã xác minh email của bạn' : 'Your email verification code'}</Text>
      <Text style={{ color: NEUTRAL_900, fontSize: '34px', fontWeight: 700, letterSpacing: '10px', margin: '12px 0' }}>{otp}</Text>
      <Text style={{ color: NEUTRAL_600, fontSize: '12px', margin: 0 }}>{locale === 'vi' ? `Mã chỉ dùng một lần và có hiệu lực trong ${expiresInMin} phút.` : `This one-time code expires in ${expiresInMin} minutes.`}</Text>
    </Section>
  );
}

function PolicyParagraphs({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <Section style={{ background: '#FFF8E7', borderRadius: '8px', padding: '14px 16px' }}>
      {lines.map((line, index) => (
        <Text
          key={line}
          style={{
            color: NEUTRAL_600,
            fontSize: '13px',
            lineHeight: '20px',
            margin: index === lines.length - 1 ? 0 : '0 0 8px',
          }}
        >
          {line}
        </Text>
      ))}
    </Section>
  );
}

function EmailView({ copy, locale, brand, data }: { copy: Copy; locale: Locale; brand: EmailBrand; data: TemplateData }) {
  const logo = safeLogo(brand.logoUrl);
  const icon = copy.statusIcon ? STATUS_ASSETS[copy.statusIcon] : undefined;
  const primary = brand.primaryColor || '#6941C6';
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{interpolate(copy.intro, data)}</Preview>
      <Body style={{ backgroundColor: BODY_BG, fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: '32px 12px' }}>
        <Container style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', margin: '0 auto', maxWidth: '640px', overflow: 'hidden' }}>
          <Section style={{ padding: '36px 32px 20px', textAlign: 'center' }}>
            {logo ? <Img src={logo} alt={brand.name} height="52" style={{ display: 'inline-block', maxWidth: '210px', objectFit: 'contain' }} /> : <Text style={{ color: primary, fontSize: '25px', fontWeight: 700, margin: 0 }}>{brand.name}</Text>}
          </Section>
          <Section style={{ padding: '0 32px 36px' }}>
            {icon ? <Img src={`cid:${icon.cid}`} alt="" width="44" height="44" style={{ margin: '0 auto 18px' }} /> : null}
            <Text style={{ color: NEUTRAL_900, fontSize: '24px', fontWeight: 700, lineHeight: '32px', margin: '0 0 14px', textAlign: 'center' }}>{copy.title}</Text>
            <Text style={{ color: NEUTRAL_600, fontSize: '15px', lineHeight: '24px', margin: '0 0 22px', textAlign: 'center' }}>{interpolate(copy.intro, data)}</Text>
            {data.otp ? <OtpCard otp={data.otp} expiresInMin={data.expiresInMin ?? 15} locale={locale} /> : null}
            {data.bookingCode ? (
              <Section style={{ border: `1px solid ${NEUTRAL_300}`, borderRadius: '12px', padding: '6px 20px', margin: '24px 0' }}>
                <DetailRow label={locale === 'vi' ? 'Mã booking' : 'Booking code'} value={data.bookingCode} />
                <DetailRow label={locale === 'vi' ? 'Phòng/Dịch vụ' : 'Service'} value={data.listingTitle} />
                <DetailRow label={locale === 'vi' ? 'Địa chỉ' : 'Address'} value={data.listingAddress} />
                <DetailRow label={locale === 'vi' ? 'Bắt đầu' : 'Starts'} value={data.startsAt} />
                <DetailRow label={locale === 'vi' ? 'Kết thúc' : 'Ends'} value={data.endsAt} />
                <DetailRow label={locale === 'vi' ? 'Người đặt' : 'Customer'} value={data.recipientName} />
                <DetailRow label={locale === 'vi' ? 'Trạng thái' : 'Status'} value={copy.status} />
                <DetailRow label={locale === 'vi' ? 'Tổng tiền' : 'Total'} value={data.totalAmount ?? data.amount} />
                <DetailRow label={locale === 'vi' ? 'Đã cọc' : 'Deposit'} value={data.depositAmount} />
                <DetailRow label={locale === 'vi' ? 'Phí hủy/vắng mặt' : 'Cancellation/no-show fee'} value={data.cancellationFee} />
                <DetailRow label={locale === 'vi' ? 'Tiền được hoàn' : 'Refund'} value={data.refundAmount} />
                <DetailRow label={locale === 'vi' ? 'Còn lại phải thanh toán' : 'Balance due'} value={data.balanceAmount} />
              </Section>
            ) : null}
            <PolicyParagraphs lines={data.policyLines} />
            {data.agreementVersions ? <Text style={{ color: NEUTRAL_600, fontSize: '13px' }}>{data.agreementVersions}</Text> : null}
            {copy.cta && data.ctaUrl ? <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}><Button href={data.ctaUrl} style={{ backgroundColor: primary, borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', fontWeight: 700, padding: '13px 22px', textDecoration: 'none' }}>{copy.cta}</Button></Section> : null}
            {data.termsUrl ? <Text style={{ fontSize: '13px', textAlign: 'center' }}><a href={data.termsUrl} style={{ color: primary }}>{locale === 'vi' ? 'Xem điều khoản sử dụng' : 'View terms of use'}</a></Text> : null}
          </Section>
          <Hr style={{ borderColor: NEUTRAL_100, margin: 0 }} />
          <Section style={{ padding: '22px 32px 28px', textAlign: 'center' }}>
            <Text style={{ color: NEUTRAL_600, fontSize: '12px', lineHeight: '18px', margin: 0 }}>{locale === 'vi' ? 'Email này là email tự động, vui lòng không trả lời.' : 'This is an automated email. Please do not reply.'}</Text>
            <Text style={{ color: NEUTRAL_600, fontSize: '12px', lineHeight: '18px', margin: '6px 0 0' }}>{brand.contactEmail ?? brand.name}{brand.contactPhone ? ` · ${brand.contactPhone}` : ''}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

@Injectable()
export class ReactEmailRenderer implements IEmailRenderer {
  async render(templateId: EmailTemplateId, rawLocale: string | null | undefined, brand: EmailBrand, data: TemplateData): Promise<EmailContent> {
    const locale = normalizeLocale(rawLocale);
    const copy = COPY[templateId][locale];
    const preview = interpolate(copy.intro, data);
    const isAuthOtp = templateId === 'auth_registration_otp'
      || templateId === 'auth_password_reset_otp';
    const html = await render(
      isAuthOtp
        ? <AuthOtpEmail
            brand={brand}
            data={data}
            locale={locale}
            preview={preview}
            templateId={templateId}
          />
        : isBookingCustomerTemplate(templateId) && copy.statusIcon
        ? <BookingCustomerEmail
            brand={brand}
            data={data}
            locale={locale}
            preview={preview}
            statusIconCid={STATUS_ASSETS[copy.statusIcon].cid}
            templateId={templateId}
          />
        : <EmailView copy={copy} locale={locale} brand={brand} data={data} />,
    );
    const assetRoot = path.join(
      path.basename(process.cwd()) === 'api'
        ? process.cwd()
        : path.join(process.cwd(), 'apps/api'),
      'src/modules/notification/email/assets',
    );
    const attachmentAssets = [
      ...(copy.statusIcon ? [STATUS_ASSETS[copy.statusIcon]] : []),
      ...(isBookingCustomerTemplate(templateId) && templateId !== 'booking_refunded_customer'
        ? [SUPPORTING_ASSETS.calendar]
        : []),
      ...(templateId === 'booking_confirmed_customer' && data.bookingCustomer?.policyItems?.length
        ? [SUPPORTING_ASSETS.policyCheck]
        : []),
    ];
    const attachments: EmailAttachment[] = attachmentAssets.map((asset) => ({
      filename: asset.filename,
      cid: asset.cid,
      path: path.join(assetRoot, asset.filename),
    }));
    return {
      subject: interpolate(copy.subject, data),
      html,
      text: toPlainText(html),
      ...(attachments.length ? { attachments } : {}),
    };
  }
}
