import type { ContentReportTarget } from '@booking/contracts';
import { useActionData, useLocation, useOutletContext } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontContext } from '~/root';

type ReportActionData = {
  reportOk?: boolean;
  duplicate?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type ReportDialogView = 'login' | 'success' | 'form';

export function useContentReportDialogController({
  target,
  targetId,
}: {
  target: ContentReportTarget;
  targetId: string;
}) {
  const { currentUser, locale } = useOutletContext<StorefrontContext>();
  const location = useLocation();
  const actionData = useActionData() as ReportActionData | undefined;
  const joiner = location.search ? '&' : '?';
  const returnTo = `${location.pathname}${location.search}${joiner}report=1`;
  const view: ReportDialogView = !currentUser ? 'login' : actionData?.reportOk ? 'success' : 'form';

  return {
    actionData,
    defaultValues: {
      target,
      targetId,
      reason: 'misleading' as const,
      details: '',
    },
    loginPath: storefrontPaths.login(locale, returnTo),
    view,
  };
}
