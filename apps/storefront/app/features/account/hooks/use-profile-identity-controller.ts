import type { CurrentUser, CustomerProfileFormInput } from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';

interface ProfileIdentityLabels {
  fullName: string;
  phone: string;
  placeholder: string;
}

/**
 * A stable, human-readable handle a customer can quote to support. Derived from
 * the user id rather than stored, so it never needs its own column.
 */
export function customerReference(userId: string): string {
  return `CUS${userId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function useProfileIdentityController({
  user,
  labels,
}: {
  user: CurrentUser;
  labels: ProfileIdentityLabels;
}) {
  const fields: FieldConfig<CustomerProfileFormInput>[] = [
    {
      name: 'fullName',
      type: 'text',
      label: labels.fullName,
      placeholder: labels.placeholder,
      autoComplete: 'name',
      required: true,
    },
    {
      name: 'phone',
      type: 'text',
      label: labels.phone,
      placeholder: labels.placeholder,
      autoComplete: 'tel',
    },
  ];

  return {
    customerId: customerReference(user.id),
    defaultValues: {
      fullName: user.fullName,
      phone: user.phone ?? '',
      avatarUrl: user.avatarUrl,
    } satisfies CustomerProfileFormInput,
    fields,
  };
}
