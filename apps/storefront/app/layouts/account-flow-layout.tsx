import type { ReactNode } from 'react';
import type { StorefrontContext } from '../root';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

type AccountFlowLayoutProps = {
  children: ReactNode;
  context: StorefrontContext;
  section: ReactNode;
  contentClassName?: string;
  contentAs?: 'div' | 'main';
};

export function AccountFlowLayout({
  children,
  context,
  section,
  contentClassName,
  contentAs = 'main',
}: AccountFlowLayoutProps) {
  const Content = contentAs;

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <SiteHeader
        tenant={context.tenant}
        listingTypes={context.listingTypes}
        locale={context.locale}
        currentUser={context.currentUser}
      />
      <span className="sr-only">{section}</span>
      <Content className={contentClassName}>{children}</Content>
      <SiteFooter tenant={context.tenant} className="mt-0" />
    </div>
  );
}
