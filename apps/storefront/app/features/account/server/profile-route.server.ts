import { customerAccountSettingsInputSchema } from '@booking/contracts';
import { data } from 'react-router';
import { requireAuth } from '~/lib/server/auth.server';
import { storefrontPaths } from '~/constants/paths';

export type ProfileActionData = {
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
};

type StorefrontLocale = 'vi' | 'en';

export function loadAccountProfileRoute(request: Request, locale: StorefrontLocale) {
  requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  return null;
}

export async function handleAccountProfileAction(request: Request, locale: StorefrontLocale) {
  requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  const body: unknown = await request.json().catch(() => ({}));
  const value = body && typeof body === 'object' ? body : {};
  const parsed = customerAccountSettingsInputSchema.safeParse(value);

  if (!parsed.success) {
    return data<ProfileActionData>(
      {
        saved: false,
        error: null,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  return data<ProfileActionData>({ saved: true, error: null, fieldErrors: null });
}
