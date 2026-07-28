import { useNavigation, useResolvedPath } from 'react-router';

/**
 * True only while a navigation to `to` is in flight.
 *
 * `useNavigation().state` is global, so testing it alone lights up every pending
 * affordance on the page at once — click one room's "Chọn" and all of them
 * spin. Comparing against the resolved target scopes the feedback to the link
 * the user actually activated. Safe without a basename (see react-router.config.ts).
 */
export function useIsNavigatingTo(to: string): boolean {
  const navigation = useNavigation();
  const path = useResolvedPath(to);
  return (
    navigation.state !== 'idle' &&
    navigation.location?.pathname === path.pathname &&
    navigation.location?.search === path.search
  );
}
