import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { Link, useRevalidator } from 'react-router';
import { Button } from './ui/button';
import { routeErrorPresentation } from '../lib/route-error';

export interface RouteErrorStateProps {
  error: unknown;
  homeHref: string;
  homeLabel?: string;
}

export function RouteErrorState({
  error,
  homeHref,
  homeLabel = 'Quay lại',
}: RouteErrorStateProps) {
  const presentation = routeErrorPresentation(error);
  const revalidator = useRevalidator();

  return (
    <section className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">Mã lỗi {presentation.status}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{presentation.title}</h1>
        <p className="text-sm text-muted-foreground">{presentation.description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link to={homeHref}>
            <ArrowLeft className="size-4" />
            {homeLabel}
          </Link>
        </Button>
        {presentation.retryable ? (
          <Button
            type="button"
            onClick={() => revalidator.revalidate()}
            disabled={revalidator.state !== 'idle'}
          >
            <RotateCcw className="size-4" />
            Thử lại
          </Button>
        ) : null}
      </div>
    </section>
  );
}
