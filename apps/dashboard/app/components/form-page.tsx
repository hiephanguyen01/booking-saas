import type { ReactNode } from 'react';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';

/**
 * The shell every full-page form sits in — "tạo mới" and "sửa" alike: back
 * link, title block, an optional strip of status/feedback surfaces, then the
 * form. One component so the create and edit screens of the same resource
 * cannot drift in spacing, width or where the back link sits; each of them used
 * to hand-roll this wrapper, and no two agreed.
 */
export function FormPage({
  backTo,
  backLabel,
  title,
  description,
  banner,
  children,
}: {
  backTo: string;
  /** Where the back link goes — the list or record the form belongs to. */
  backLabel: string;
  title: string;
  description?: string;
  /** Status strips and success/error surfaces, between the header and the form. */
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <div>
        <BackLink to={backTo} label={backLabel} className="mb-2" />
        <PageHeader title={title} description={description} />
      </div>
      {banner}
      {children}
    </div>
  );
}
