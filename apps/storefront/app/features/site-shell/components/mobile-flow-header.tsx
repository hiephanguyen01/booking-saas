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
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#131a2a] pt-[env(safe-area-inset-top)] text-white md:hidden">
      <div className="grid min-h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center px-2">
        {backHref ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white"
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
            className="size-11 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white"
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
