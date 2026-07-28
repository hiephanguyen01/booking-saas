import type { PublicPackageOption } from '~/lib/package-options';

export interface PackageDetails {
  style: string | null;
  editedPhotos: number | null;
  rawFiles: boolean | null;
}

export function packageDetails(attributes: Record<string, unknown>): PackageDetails {
  const editedPhotos = Number(attributes.editedPhotos);
  return {
    style: typeof attributes.photographyStyle === 'string' ? attributes.photographyStyle : null,
    editedPhotos: Number.isInteger(editedPhotos) && editedPhotos >= 0 ? editedPhotos : null,
    rawFiles: typeof attributes.rawFiles === 'boolean' ? attributes.rawFiles : null,
  };
}

export function packageDurationHours(item: PublicPackageOption): number {
  return item.duration / 60;
}
