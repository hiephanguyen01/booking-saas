import { useNavigation } from 'react-router';

/** True while any navigation/submission is in flight — disables submit controls. */
export function useBusy(): boolean {
  return useNavigation().state !== 'idle';
}
