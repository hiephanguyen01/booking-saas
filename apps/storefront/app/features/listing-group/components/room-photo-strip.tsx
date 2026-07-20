import { ImageIcon } from 'lucide-react';

export function RoomPhotoStrip({ photos, title }: { photos: string[]; title: string }) {
  const [cover, second, third] = photos;
  if (!cover)
    return (
      <div className="grid h-36 place-items-center rounded-md bg-muted text-muted-foreground">
        <ImageIcon className="size-7" aria-hidden="true" />
        <span className="sr-only">{title}</span>
      </div>
    );
  return (
    <div className="grid h-36 grid-cols-[2fr_1fr] grid-rows-2 gap-1.5 overflow-hidden rounded-md">
      <img src={cover} alt={title} className="row-span-2 size-full object-cover" />
      {second ? (
        <img src={second} alt="" className="size-full object-cover" />
      ) : (
        <div className="bg-muted" />
      )}
      {third ? (
        <img src={third} alt="" className="size-full object-cover" />
      ) : (
        <div className="bg-muted" />
      )}
    </div>
  );
}
