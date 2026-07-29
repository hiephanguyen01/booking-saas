import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from 'react-email';
import type {
  BookingEmailPolicyItem,
  BookingCustomerEmailData,
  EmailBrand,
  Locale,
  TemplateData,
} from '../../domain/email-template';
import type { EmailTemplateId } from '../../domain/ports/email-renderer.port';

export type BookingCustomerTemplateId = Extract<
  EmailTemplateId,
  | 'booking_confirmed_customer'
  | 'booking_cancelled_customer'
  | 'booking_refunded_customer'
  | 'booking_no_show_customer'
>;

export const BOOKING_EMAIL_CIDS = {
  calendar: 'booking-calendar@bookingos',
  policyCheck: 'booking-policy-check@bookingos',
} as const;

const COLORS = {
  white: '#FFFFFF',
  neutral900: '#101828',
  neutral800: '#1D2939',
  neutral700: '#344054',
  neutral600: '#475467',
  neutral500: '#667085',
  neutral300: '#D0D5DD',
  neutral100: '#F2F4F7',
  background: '#EAECF0',
  green: '#0ABF90',
  greenDark: '#009B76',
  red: '#F43F3F',
  orange: '#FFA500',
} as const;

interface BookingCustomerEmailProps {
  templateId: BookingCustomerTemplateId;
  locale: Locale;
  brand: EmailBrand;
  data: TemplateData;
  preview: string;
  statusIconCid: string;
}

interface HeroCopy {
  title: string;
  firstLine: string;
  highlight?: string;
  secondLine: string;
  cta: string;
  status: string;
  color: string;
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function heroCopy(
  templateId: BookingCustomerTemplateId,
  locale: Locale,
  bookingCode: string,
  brandName: string,
): HeroCopy {
  const vi = locale === 'vi';
  switch (templateId) {
    case 'booking_confirmed_customer':
      return {
        title: vi ? 'Đơn của quý khách đã được xác nhận!' : 'Your booking is confirmed!',
        firstLine: vi ? 'Mã booking của quý khách là' : 'Your booking code is',
        highlight: bookingCode,
        secondLine: vi
          ? `Để quản lý đơn đặt, vui lòng sử dụng nền tảng ${brandName} để theo dõi dễ dàng hơn.`
          : `Use ${brandName} to track and manage your booking.`,
        cta: vi ? 'Đơn đặt của tôi' : 'View my booking',
        status: vi ? 'Đã xác nhận' : 'Confirmed',
        color: COLORS.green,
      };
    case 'booking_cancelled_customer':
      return {
        title: vi ? 'Đơn của quý khách đã được hủy' : 'Your booking was cancelled',
        firstLine: vi ? `Xác nhận hủy đơn ${bookingCode}.` : `Booking ${bookingCode} was cancelled.`,
        secondLine: vi
          ? 'Đơn sẽ được hoàn tiền theo chính sách áp dụng.'
          : 'Any eligible refund follows the applicable policy.',
        cta: vi ? 'Đơn đặt của tôi' : 'View my booking',
        status: vi ? 'Đã hủy' : 'Cancelled',
        color: COLORS.red,
      };
    case 'booking_refunded_customer':
      return {
        title: vi ? 'Xác nhận hoàn tiền' : 'Refund confirmed',
        firstLine: vi ? `Xác nhận hoàn tiền đơn ${bookingCode}.` : `Refund confirmed for booking ${bookingCode}.`,
        secondLine: vi
          ? 'Đơn của quý khách đã được hoàn tiền thành công.'
          : 'Your booking was refunded successfully.',
        cta: vi ? 'Đơn đặt của tôi' : 'View my booking',
        status: vi ? 'Đã hoàn tiền' : 'Refunded',
        color: COLORS.green,
      };
    case 'booking_no_show_customer':
      return {
        title: vi ? 'Quý khách không thực hiện đơn' : 'Booking marked as no-show',
        firstLine: vi ? `Xác nhận vắng mặt đơn ${bookingCode}.` : `No-show recorded for booking ${bookingCode}.`,
        secondLine: vi
          ? 'Đơn của quý khách không được hoàn tiền theo chính sách.'
          : 'The booking is not refundable under the applicable policy.',
        cta: vi ? 'Đơn đặt của tôi' : 'View my booking',
        status: vi ? 'Vắng mặt' : 'No-show',
        color: COLORS.orange,
      };
  }
}

function BrandedHeader({ brand }: { brand: EmailBrand }) {
  const logo = safeHttpUrl(brand.logoUrl);
  return (
    <Section style={{ height: '60px', textAlign: 'center' }}>
      {logo ? (
        <Img
          alt={brand.name}
          height="60"
          src={logo}
          style={{ display: 'inline-block', height: '60px', maxWidth: '199px', objectFit: 'contain', width: '199px' }}
          width="199"
        />
      ) : (
        <Text style={{ color: brand.primaryColor, fontSize: '26px', fontWeight: 600, lineHeight: '60px', margin: 0 }}>
          {brand.name}
        </Text>
      )}
    </Section>
  );
}

function StatusHero({
  brand,
  copy,
  ctaUrl,
  statusIconCid,
}: {
  brand: EmailBrand;
  copy: HeroCopy;
  ctaUrl?: string;
  statusIconCid: string;
}) {
  return (
    <Section className="email-panel-padding" style={{ backgroundColor: COLORS.white, padding: '40px 32px' }}>
      <BrandedHeader brand={brand} />
      <Section style={{ marginTop: '32px', textAlign: 'center' }}>
        <Img alt="" height="40" src={`cid:${statusIconCid}`} style={{ margin: '0 auto' }} width="40" />
        <Text style={{ color: copy.color, fontSize: '18px', fontWeight: 600, lineHeight: '28px', margin: '16px 0' }}>
          {copy.title}
        </Text>
        <Text style={{ fontSize: '16px', fontWeight: 500, lineHeight: '24px', margin: 0 }}>
          {copy.highlight ? (
            <>
              <span style={{ color: COLORS.neutral700 }}>{copy.firstLine} </span>
              <span style={{ color: COLORS.neutral800, fontWeight: 600 }}>{copy.highlight}</span>
              <span style={{ color: COLORS.neutral700 }}>. {copy.secondLine}</span>
            </>
          ) : (
            <span style={{ color: COLORS.neutral600 }}>
              {copy.firstLine}<br />{copy.secondLine}
            </span>
          )}
        </Text>
      </Section>
      {ctaUrl ? (
        <Section style={{ marginTop: '32px', textAlign: 'center' }}>
          <Button
            href={ctaUrl}
            style={{
              backgroundColor: brand.primaryColor,
              borderRadius: '6px',
              color: COLORS.white,
              display: 'inline-block',
              fontSize: '18px',
              fontWeight: 600,
              lineHeight: '28px',
              padding: '12px 0',
              textAlign: 'center',
              textDecoration: 'none',
              width: '240px',
            }}
          >
            {copy.cta}
          </Button>
        </Section>
      ) : null}
    </Section>
  );
}

function BookingServiceCard({
  confirmed = false,
  snapshot,
}: {
  confirmed?: boolean;
  snapshot: BookingCustomerEmailData;
}) {
  const image = safeHttpUrl(snapshot.service.imageUrl);
  const hasProviderAddress = Boolean(snapshot.provider.address);
  const hasProviderPhone = Boolean(snapshot.provider.phone);
  const schedule = confirmed
    ? (snapshot.service.confirmationDateRange ?? snapshot.service.schedule)
    : snapshot.service.schedule;
  const duration = confirmed
    ? (snapshot.service.confirmationTimeBadge ?? snapshot.service.duration)
    : snapshot.service.duration;
  return (
    <Section>
      <Text style={{ color: COLORS.neutral900, fontSize: confirmed ? '18px' : '16px', fontWeight: 600, lineHeight: confirmed ? '28px' : '24px', margin: confirmed ? `0 0 ${hasProviderAddress || hasProviderPhone ? '8px' : '24px'}` : '0 0 16px' }}>
        {snapshot.provider.name}
      </Text>
      {snapshot.provider.address ? (
        <Text style={{ color: COLORS.neutral600, fontSize: '16px', fontWeight: 500, lineHeight: '24px', margin: confirmed ? (hasProviderPhone ? 0 : '0 0 24px') : '-8px 0 0' }}>
          {snapshot.provider.address}
        </Text>
      ) : null}
      {snapshot.provider.phone ? (
        <Text style={{ fontSize: '16px', fontWeight: 500, lineHeight: '24px', margin: confirmed ? '0 0 24px' : '0 0 16px' }}>
          <a href={`tel:${snapshot.provider.phone}`} style={{ color: COLORS.green, textDecoration: 'underline' }}>
            {snapshot.provider.phone}
          </a>
        </Text>
      ) : null}
      <Row>
        {image ? (
          <Column className="service-image-column" style={{ width: '111px' }}>
            <Img
              alt={snapshot.service.title}
              height="80"
              src={image}
              style={{ borderRadius: '12px', display: 'block', height: '80px', objectFit: 'cover', width: '111px' }}
              width="111"
            />
          </Column>
        ) : null}
        {image ? <Column style={{ width: '16px' }} /> : null}
        <Column>
          <Text style={{ color: COLORS.neutral800, fontSize: '14px', fontWeight: 600, lineHeight: '20px', margin: 0 }}>
            {snapshot.service.title}
          </Text>
          <Row style={{ marginTop: '10px' }}>
            <Column style={{ width: '18px' }}>
              <Img alt="" height="18" src={`cid:${BOOKING_EMAIL_CIDS.calendar}`} width="18" />
            </Column>
            <Column style={{ width: '8px' }} />
            <Column>
              <Text style={{ color: COLORS.neutral700, fontSize: '12px', fontWeight: 500, lineHeight: '16px', margin: 0 }}>
                {schedule}
              </Text>
            </Column>
          </Row>
          {duration ? (
            <Text style={{ backgroundColor: COLORS.neutral100, borderRadius: '16px', color: COLORS.neutral600, display: 'inline-block', fontSize: '12px', fontWeight: 500, lineHeight: '16px', margin: '10px 0 0', padding: '2px 8px' }}>
              {duration}
            </Text>
          ) : null}
        </Column>
      </Row>
    </Section>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value?: string; last?: boolean }) {
  if (!value) return null;
  return (
    <Row style={{ borderBottom: last ? undefined : `1px solid ${COLORS.neutral300}` }}>
      <Column className="detail-label" style={{ color: COLORS.neutral500, fontSize: '16px', fontWeight: 500, lineHeight: '24px', padding: '16px 0', width: '140px' }}>
        {label}
      </Column>
      <Column className="detail-gap" style={{ width: '24px' }} />
      <Column className="detail-value" style={{ color: COLORS.neutral900, fontSize: '16px', fontWeight: 500, lineHeight: '24px', padding: '16px 0' }}>
        {value}
      </Column>
    </Row>
  );
}

function DetailSection({ title, rows }: { title?: string; rows: Array<{ label: string; value?: string }> }) {
  const visible = rows.filter((row) => row.value);
  if (visible.length === 0) return null;
  return (
    <Section>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      {visible.map((row, index) => (
        <DetailRow key={row.label} label={row.label} last={index === visible.length - 1} value={row.value} />
      ))}
    </Section>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ color: COLORS.neutral900, fontSize: '18px', fontWeight: 600, lineHeight: '28px', margin: '0 0 16px', textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
}

function MoneyRow({ label, value, last = false }: { label: string; value?: string; last?: boolean }) {
  if (!value) return null;
  return (
    <Row style={{ borderBottom: last ? undefined : `1px solid ${COLORS.neutral300}` }}>
      <Column style={{ color: COLORS.neutral500, fontSize: '16px', fontWeight: 500, lineHeight: '24px', padding: '16px 0', width: '50%' }}>
        {label}
      </Column>
      <Column style={{ color: COLORS.neutral900, fontSize: '16px', fontWeight: 600, lineHeight: '24px', padding: '16px 0', textAlign: 'right', width: '50%' }}>
        {value}
      </Column>
    </Row>
  );
}

function MoneySection({ snapshot, locale }: { snapshot: BookingCustomerEmailData; locale: Locale }) {
  const pricing = snapshot.pricing;
  if (!pricing) return null;
  const vi = locale === 'vi';
  return (
    <Section>
      <SectionTitle>{vi ? 'Thông tin thanh toán' : 'Payment information'}</SectionTitle>
      {(pricing.summaryLine ? [pricing.summaryLine] : pricing.lines).map((line) => (
        <Row key={`${line.label}-${line.amount}`} style={{ borderBottom: `1px solid ${COLORS.neutral300}` }}>
          <Column style={{ color: COLORS.neutral500, fontSize: '16px', fontWeight: 500, lineHeight: '24px', padding: '16px 0', width: '50%' }}>
            {line.label}
          </Column>
          <Column style={{ padding: '12px 0', textAlign: 'right', width: '50%' }}>
            {line.discountPercent ? <Text style={{ color: COLORS.red, fontSize: '14px', fontWeight: 600, lineHeight: '20px', margin: 0 }}>-{line.discountPercent}%</Text> : null}
            {line.regularAmount ? <Text style={{ color: COLORS.neutral500, fontSize: '14px', lineHeight: '20px', margin: 0, textDecoration: 'line-through' }}>{line.regularAmount}</Text> : null}
            <Text style={{ color: COLORS.neutral900, fontSize: '16px', fontWeight: 600, lineHeight: '24px', margin: 0 }}>{line.amount}</Text>
          </Column>
        </Row>
      ))}
      <MoneyRow label={vi ? 'Khuyến mãi' : 'Promotion'} value={pricing.promotionDiscount ? `- ${pricing.promotionDiscount}` : undefined} />
      <MoneyRow label={vi ? 'Tổng tiền' : 'Total'} value={pricing.total} />
      <MoneyRow label={`${pricing.paidLabel ?? (vi ? 'Đã thanh toán' : 'Paid')}${pricing.paymentMethod ? ` (${pricing.paymentMethod})` : ''}`} value={pricing.paid} />
      <MoneyRow label={vi ? 'Còn lại phải thanh toán' : 'Balance due'} last value={pricing.balance} />
    </Section>
  );
}

function PolicySection({ items, locale }: { items?: BookingEmailPolicyItem[]; locale: Locale }) {
  if (!items?.length) return null;
  return (
    <Section>
      <SectionTitle>{locale === 'vi' ? 'Chính sách hủy' : 'Cancellation policy'}</SectionTitle>
      {items.map((item) => (
        <Row key={item.text} style={{ marginBottom: '4px' }}>
          <Column style={{ width: '24px' }}>
            <Img alt="" height="24" src={`cid:${BOOKING_EMAIL_CIDS.policyCheck}`} width="24" />
          </Column>
          <Column style={{ width: '8px' }} />
          <Column style={{ color: item.tone === 'positive' ? COLORS.greenDark : COLORS.neutral800, fontSize: '16px', fontWeight: 500, lineHeight: '24px' }}>
            {item.text}
          </Column>
        </Row>
      ))}
    </Section>
  );
}

function NoticeBox({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <Section className="email-panel-padding" style={{ backgroundColor: COLORS.neutral100, padding: '20px 32px' }}>
      {lines.map((line) => (
        <Text key={line} style={{ color: COLORS.neutral600, fontSize: '14px', fontWeight: 500, lineHeight: '20px', margin: '0 0 4px' }}>
          {line}
        </Text>
      ))}
    </Section>
  );
}

function ConfirmedBookingBody({
  detailRows,
  locale,
  snapshot,
}: {
  detailRows: Array<{ label: string; value?: string }>;
  locale: Locale;
  snapshot: BookingCustomerEmailData;
}) {
  const hasPaymentNotice = Boolean(snapshot.pricing?.noticeLines?.length);
  const hasPolicy = Boolean(snapshot.policyItems?.length);
  const hasPolicyNotice = Boolean(snapshot.policyNoticeLines?.length);
  return (
    <Section style={{ backgroundColor: COLORS.white, padding: '32px 0 0' }}>
      <Section className="email-content-padding" style={{ padding: '0 32px' }}>
        <BookingServiceCard confirmed snapshot={snapshot} />
        <Section style={{ height: '40px' }} />
        <DetailSection
          rows={detailRows}
          title={locale === 'vi' ? 'Chi tiết đơn' : 'Booking details'}
        />
        <Section style={{ height: '40px' }} />
        <MoneySection locale={locale} snapshot={snapshot} />
      </Section>
      {hasPaymentNotice ? (
        <>
          <Section style={{ height: '16px' }} />
          <NoticeBox lines={snapshot.pricing?.noticeLines} />
        </>
      ) : null}
      {hasPolicy ? (
        <Section className="email-content-padding" style={{ padding: '40px 32px 0' }}>
          <PolicySection items={snapshot.policyItems} locale={locale} />
        </Section>
      ) : null}
      {hasPolicyNotice ? (
        <>
          <Section style={{ height: '16px' }} />
          <NoticeBox lines={snapshot.policyNoticeLines} />
        </>
      ) : null}
      {!hasPaymentNotice && !hasPolicy && !hasPolicyNotice ? <Section style={{ height: '32px' }} /> : null}
    </Section>
  );
}

function fallbackSnapshot(data: TemplateData): BookingCustomerEmailData {
  return {
    provider: { name: data.partnerName ?? data.tenantName, ...(data.listingAddress ? { address: data.listingAddress } : {}) },
    service: {
      title: data.listingTitle ?? '',
      schedule: [data.startsAt, data.endsAt].filter(Boolean).join(' – '),
    },
    pricing: {
      lines: [],
      total: data.amount ?? data.totalAmount ?? '',
      ...(data.depositAmount ? { paid: data.depositAmount } : {}),
      ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
      ...(data.balanceAmount ? { balance: data.balanceAmount } : {}),
    },
    refund: {
      ...(data.refundAmount ? { amount: data.refundAmount } : {}),
      ...(data.cancellationFee ? { fee: data.cancellationFee } : {}),
    },
    ...(data.policyText ? { noticeLines: [data.policyText] } : {}),
  };
}

export function isBookingCustomerTemplate(
  templateId: EmailTemplateId,
): templateId is BookingCustomerTemplateId {
  return templateId === 'booking_confirmed_customer'
    || templateId === 'booking_cancelled_customer'
    || templateId === 'booking_refunded_customer'
    || templateId === 'booking_no_show_customer';
}

export function BookingCustomerEmail({
  templateId,
  locale,
  brand,
  data,
  preview,
  statusIconCid,
}: BookingCustomerEmailProps) {
  const snapshot = data.bookingCustomer ?? fallbackSnapshot(data);
  const copy = heroCopy(templateId, locale, data.bookingCode ?? '', brand.name);
  const vi = locale === 'vi';
  const commonRows = [
    { label: vi ? 'Mã booking' : 'Booking code', value: data.bookingCode },
    { label: vi ? 'Phòng/Dịch vụ' : 'Service', value: snapshot.service.title },
    {
      label: vi ? 'Bắt đầu' : 'Starts',
      value: templateId === 'booking_confirmed_customer'
        ? (snapshot.detailStartsAt ?? data.startsAt)
        : data.startsAt,
    },
    {
      label: vi ? 'Kết thúc' : 'Ends',
      value: templateId === 'booking_confirmed_customer'
        ? (snapshot.detailEndsAt ?? data.endsAt)
        : data.endsAt,
    },
    { label: vi ? 'Người đặt' : 'Customer', value: data.recipientName },
  ];
  const customerRows = [
    ...commonRows,
    { label: vi ? 'Số điện thoại' : 'Phone', value: data.recipientPhone },
    { label: 'Email', value: data.recipientEmail },
    { label: vi ? 'Lời nhắn' : 'Message', value: data.customerNote },
  ];

  return (
    <Html lang={locale}>
      <Head>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600&display=swap" rel="stylesheet" />
        <style>{`
          @media only screen and (max-width: 480px) {
            .email-panel-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .email-content-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .detail-label { display: block !important; padding-bottom: 2px !important; width: 100% !important; }
            .detail-gap { display: none !important; }
            .detail-value { display: block !important; padding-top: 0 !important; width: 100% !important; }
            .service-image-column { width: 92px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: COLORS.background, fontFamily: 'Montserrat, Arial, Helvetica, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ margin: '0 auto', maxWidth: '600px', width: '100%' }}>
          <StatusHero brand={brand} copy={copy} ctaUrl={data.ctaUrl} statusIconCid={statusIconCid} />
          <Section style={{ height: '12px' }} />
          {templateId === 'booking_refunded_customer' ? (
            <Section className="email-content-padding" style={{ backgroundColor: COLORS.white, padding: '32px' }}>
              <DetailSection rows={[
                { label: vi ? 'Trạng thái' : 'Status', value: copy.status },
                { label: vi ? 'Tiền được hoàn' : 'Refund amount', value: snapshot.refund?.amount },
                { label: vi ? 'TK nhận tiền' : 'Refund destination', value: snapshot.refund?.destination },
              ]} />
            </Section>
          ) : templateId === 'booking_confirmed_customer' ? (
            <ConfirmedBookingBody detailRows={customerRows} locale={locale} snapshot={snapshot} />
          ) : (
            <Section style={{ backgroundColor: COLORS.white, padding: '32px 0 0' }}>
              <Section className="email-content-padding" style={{ padding: '0 32px' }}>
                <SectionTitle>
                  {templateId === 'booking_cancelled_customer'
                    ? (vi ? 'Thông tin đơn hủy' : 'Cancelled booking information')
                    : (vi ? 'Thông tin đơn vắng mặt' : 'No-show booking information')}
                </SectionTitle>
                <BookingServiceCard snapshot={snapshot} />
                <Section style={{ height: '40px' }} />
                <DetailSection
                  rows={commonRows}
                />
                <Section style={{ height: '40px' }} />
                <DetailSection
                  rows={[
                    { label: vi ? 'Trạng thái' : 'Status', value: copy.status },
                    { label: vi ? 'Đã thanh toán' : 'Paid', value: snapshot.pricing?.paid },
                    {
                      label: templateId === 'booking_no_show_customer'
                        ? (vi ? 'Phí vắng mặt' : 'No-show fee')
                        : (vi ? 'Phí hủy đơn' : 'Cancellation fee'),
                      value: snapshot.refund?.fee,
                    },
                    ...(templateId === 'booking_cancelled_customer' ? [
                      { label: vi ? 'Tiền được hoàn' : 'Refund amount', value: snapshot.refund?.amount },
                      { label: vi ? 'TK nhận tiền' : 'Refund destination', value: snapshot.refund?.destination },
                    ] : []),
                  ]}
                  title={templateId === 'booking_cancelled_customer'
                    ? (vi ? 'Hủy đơn và hoàn tiền' : 'Cancellation and refund')
                    : (vi ? 'Chính sách' : 'Policy')}
                />
              </Section>
              {snapshot.noticeLines?.length ? <Section style={{ height: '16px' }} /> : null}
              <NoticeBox lines={snapshot.noticeLines} />
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
}
