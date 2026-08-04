import { useOutletContext } from 'react-router';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import { ProfileIdentityCard } from '~/features/account/components/profile/profile-identity-card';
import { ProfilePasswordCard } from '~/features/account/components/profile/profile-password-card';
import type { ProfileActionData } from '~/features/account/server/profile-route.server';

type AccountProfilePageProps = {
  actionData?: ProfileActionData | null;
};

/**
 * The account centre's profile page: two independent sections, each with its own
 * form and its own submit. `actionData.intent` routes the outcome to whichever
 * card produced it, so one card's save never reports success on the other.
 */
export function AccountProfilePage({ actionData }: AccountProfilePageProps) {
  const { user } = useOutletContext<AccountOutletContext>();
  const result = actionData ?? null;

  return (
    <div>
      <ProfileIdentityCard user={user} result={result} />
      <ProfilePasswordCard result={result} />
    </div>
  );
}
