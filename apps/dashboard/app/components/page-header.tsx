import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional status or context displayed immediately beside the title. */
  titleAdornment?: ReactNode;
  /** Right-aligned actions (buttons/links). */
  actions?: ReactNode;
}

/**
 * The one screen-title block for every dashboard area (admin · tenant ·
 * partner · affiliate): heading, optional sub-copy, optional right-aligned
 * actions that wrap under the title on narrow viewports.
 */
export function PageHeader({ title, description, titleAdornment, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {titleAdornment}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
