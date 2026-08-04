import type { CustomerPasswordChangeInput } from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';

interface ProfilePasswordLabels {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  placeholder: string;
}

export function useProfilePasswordController({ labels }: { labels: ProfilePasswordLabels }) {
  const fields: FieldConfig<CustomerPasswordChangeInput>[] = [
    {
      name: 'currentPassword',
      type: 'password',
      label: labels.currentPassword,
      placeholder: labels.placeholder,
      autoComplete: 'current-password',
      required: true,
    },
    {
      name: 'newPassword',
      type: 'password',
      label: labels.newPassword,
      placeholder: labels.placeholder,
      autoComplete: 'new-password',
      required: true,
    },
    {
      name: 'confirmPassword',
      type: 'password',
      label: labels.confirmPassword,
      placeholder: labels.placeholder,
      autoComplete: 'new-password',
      required: true,
    },
  ];

  return {
    // Password inputs always start empty — nothing to prefill from the session.
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    } satisfies CustomerPasswordChangeInput,
    fields,
  };
}
