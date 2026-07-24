import type { CustomerAccountSettingsInput } from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { useEffect, useRef, useState } from 'react';

export const ACCOUNT_AVATAR_PLACEHOLDER =
  '/images/booking-studio/home/promo-photographer.png';

type AccountProfileUser = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
};

type AccountProfileLabels = {
  fullName: string;
  email: string;
  phone: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  placeholder: string;
};

export function useAccountProfileController({
  user,
  labels,
}: {
  user: AccountProfileUser;
  labels: AccountProfileLabels;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    },
    [avatarUrl],
  );

  const fields: FieldConfig<CustomerAccountSettingsInput>[] = [
    {
      name: 'fullName',
      type: 'text',
      label: labels.fullName,
      placeholder: labels.placeholder,
      autoComplete: 'name',
    },
    {
      name: 'email',
      type: 'email',
      label: labels.email,
      placeholder: labels.placeholder,
      autoComplete: 'email',
    },
    {
      name: 'phone',
      type: 'text',
      label: labels.phone,
      placeholder: labels.placeholder,
      autoComplete: 'tel',
      disabled: true,
    },
    {
      name: 'currentPassword',
      type: 'password',
      label: labels.currentPassword,
      placeholder: labels.placeholder,
      autoComplete: 'current-password',
    },
    {
      name: 'newPassword',
      type: 'password',
      label: labels.newPassword,
      placeholder: labels.placeholder,
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      type: 'password',
      label: labels.confirmPassword,
      placeholder: labels.placeholder,
      autoComplete: 'new-password',
    },
  ];

  function choosePhoto(): void {
    inputRef.current?.click();
  }

  function selectAvatar(file: File | undefined): void {
    if (!file) return;
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    setAvatarUrl(URL.createObjectURL(file));
  }

  return {
    avatarSrc: avatarUrl ?? ACCOUNT_AVATAR_PLACEHOLDER,
    choosePhoto,
    customerId: `CUS${user.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    defaultValues: {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    fields,
    inputRef,
    selectAvatar,
  };
}
