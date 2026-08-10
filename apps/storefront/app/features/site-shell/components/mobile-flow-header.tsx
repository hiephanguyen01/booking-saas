import { Button } from '@booking/ui/components/ui/button';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Link } from 'react-router';

export function MobileFlowHeader({
  title,
  backHref,
  backLabel,
  chatHref,
  chatLabel,
}: {
  title: string;
  backHref?: string;
  backLabel: string;
  chatHref?: string;
  chatLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-background/10 bg-foreground pt-[env(safe-area-inset-top)] text-background md:hidden">
      <div className="grid min-h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center px-2">
        {backHref ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11 text-background hover:bg-background/10 hover:text-background focus-visible:ring-background"
          >
            <Link to={backHref} aria-label={backLabel}>
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <h1 className="truncate text-center text-[15px] font-semibold tracking-tight">{title}</h1>
        {chatHref && chatLabel ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11 text-background hover:bg-background/10 hover:text-background focus-visible:ring-background"
          >
            <Link to={chatHref} aria-label={chatLabel}>
              <MessageCircle className="size-5" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}
