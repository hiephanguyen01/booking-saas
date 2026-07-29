import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'react-email';
import type { EmailBrand, Locale, TemplateData } from '../../domain/email-template';
import type { AuthEmailTemplateId } from '../../domain/ports/email-renderer.port';

const NEUTRAL_900 = '#101828';
const NEUTRAL_800 = '#1D2939';
const NEUTRAL_500 = '#667085';
const BODY_BG = '#EAECF0';

function safeLogo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function authOtpCopy(
  templateId: AuthEmailTemplateId,
  locale: Locale,
  brand: EmailBrand,
  data: TemplateData,
) {
  const email = data.recipientEmail ?? '';
  const expiresInMin = data.expiresInMin ?? 15;
  if (locale === 'en') {
    return {
      title: templateId === 'auth_password_reset_otp'
        ? 'Your password reset code'
        : 'Your email verification code',
      intro: templateId === 'auth_password_reset_otp'
        ? `Use this code to continue resetting the password for ${email} on ${brand.name}`
        : `Please use this code to verify the email address ${email} on ${brand.name}`,
      expiry: `This code can only be used once and expires in ${expiresInMin} minutes`,
    };
  }
  return {
    title: templateId === 'auth_password_reset_otp'
      ? 'Mã đặt lại mật khẩu của bạn'
      : 'Mã xác minh email của bạn',
    intro: templateId === 'auth_password_reset_otp'
      ? `Vui lòng dùng mã này để tiếp tục đặt lại mật khẩu cho địa chỉ email ${email} trên ${brand.name}`
      : `Vui lòng dùng mã này để xác minh địa chỉ email ${email} trên ${brand.name}`,
    expiry: `Mã này chỉ sử dụng 1 lần và có hiệu lực trong vòng ${expiresInMin} phút`,
  };
}

export function AuthOtpEmail({
  brand,
  data,
  locale,
  preview,
  templateId,
}: {
  brand: EmailBrand;
  data: TemplateData;
  locale: Locale;
  preview: string;
  templateId: AuthEmailTemplateId;
}) {
  const logo = safeLogo(brand.logoUrl);
  const primary = brand.primaryColor || '#0085FF';
  const copy = authOtpCopy(templateId, locale, brand, data);

  return (
    <Html lang={locale}>
      <Head>
        <style>{`
          @media only screen and (max-width: 480px) {
            .auth-otp-panel { padding: 32px 20px !important; }
            .auth-otp-logo { max-width: 180px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: BODY_BG,
          fontFamily: 'Montserrat, Arial, Helvetica, sans-serif',
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            backgroundColor: '#FFFFFF',
            margin: '0 auto',
            maxWidth: '600px',
            width: '100%',
          }}
        >
          <Section
            className="auth-otp-panel"
            style={{ padding: '40px 60px', textAlign: 'center' }}
          >
            {logo ? (
              <Img
                className="auth-otp-logo"
                src={logo}
                alt={brand.name}
                width="199"
                height="60"
                style={{
                  display: 'block',
                  height: '60px',
                  margin: '0 auto 24px',
                  maxWidth: '199px',
                  objectFit: 'contain',
                  width: '199px',
                }}
              />
            ) : (
              <Text
                style={{
                  color: primary,
                  fontSize: '26px',
                  fontWeight: 600,
                  lineHeight: '60px',
                  margin: '0 0 24px',
                }}
              >
                {brand.name}
              </Text>
            )}
            <Text
              style={{
                color: NEUTRAL_900,
                fontSize: '20px',
                fontWeight: 600,
                lineHeight: '32px',
                margin: '0 0 24px',
              }}
            >
              {copy.title}
            </Text>
            <Text
              style={{
                color: primary,
                fontSize: '32px',
                fontWeight: 600,
                lineHeight: '48px',
                margin: '0 0 24px',
              }}
            >
              {data.otp}
            </Text>
            <Text
              style={{
                color: NEUTRAL_800,
                fontSize: '16px',
                fontWeight: 500,
                lineHeight: '24px',
                margin: '0 0 16px',
              }}
            >
              {copy.intro}
            </Text>
            <Text
              style={{
                color: NEUTRAL_500,
                fontSize: '16px',
                fontWeight: 500,
                lineHeight: '24px',
                margin: 0,
              }}
            >
              {copy.expiry}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
