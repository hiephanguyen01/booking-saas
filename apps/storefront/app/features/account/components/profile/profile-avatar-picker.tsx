import { MAX_UPLOAD_SIZE_MB, PHOTO_UPLOAD_ACCEPT } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { validateImageUpload } from '@booking/ui/components/form/image-upload';
import { presignAndPut } from '@booking/ui/lib/upload';
import { useRef, useState } from 'react';
import { storefrontPaths } from '~/constants/paths';
import { userInitials } from '~/features/account/lib/account-nav';

/**
 * Profile photo control for the identity card. It uploads straight to storage
 * and then only hands the resulting public URL to the surrounding form, so the
 * photo is saved by the same "Lưu thay đổi" press as the name — one section,
 * one save. Removing sets `null`, which the API reads as "clear the photo".
 */
export function ProfileAvatarPicker({
  fullName,
  value,
  onChange,
  disabled,
}: {
  fullName: string;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    const invalid = validateImageUpload(file, PHOTO_UPLOAD_ACCEPT, MAX_UPLOAD_SIZE_MB);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const { publicUrl } = await presignAndPut(file, {
        target: 'avatars',
        presignEndpoint: storefrontPaths.avatarUploadPresign,
      });
      onChange(publicUrl);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <Avatar className="size-18">
          {value ? <AvatarImage src={value} alt="" className="object-cover" /> : null}
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {uploading ? <Spinner /> : userInitials(fullName)}
          </AvatarFallback>
        </Avatar>

        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_UPLOAD_ACCEPT.join(',')}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => void selectPhoto(event.currentTarget.files?.[0])}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm border-foreground/75 px-4 text-xs font-semibold shadow-xs"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? t('profile.uploadingPhoto') : t('profile.choosePhoto')}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-sm px-3 text-xs font-semibold text-muted-foreground"
              disabled={disabled || uploading}
              onClick={() => {
                setError(null);
                onChange(null);
              }}
            >
              {t('profile.removePhoto')}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
