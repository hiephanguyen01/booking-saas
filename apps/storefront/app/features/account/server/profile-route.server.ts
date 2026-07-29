import { customerAccountSettingsInputSchema } from '@booking/contracts';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { data } from 'react-router';
import { requireCustomerAuth } from '~/lib/server/auth.server';

export type ProfileActionData = {
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
};

type StorefrontLocale = 'vi' | 'en';

export function loadAccountProfileRoute(request: Request, locale: StorefrontLocale) {
  requireCustomerAuth(request, locale, { includeSearch: false });
  return null;
}

export async function handleAccountProfileAction(request: Request, locale: StorefrontLocale) {
  requireCustomerAuth(request, locale, { includeSearch: false });
  const body = await readJsonRequestBody(request);
  const value = body.ok && body.value && typeof body.value === 'object' ? body.value : {};
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
