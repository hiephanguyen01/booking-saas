import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { NsI18n, useTranslation } from '~/lib/i18n';

/** Longer than this and the copy is clamped behind a "show more" toggle. */
const CLAMP_THRESHOLD = 220;

export function ExpandableDescription({ description }: { description: string | null }) {
  const { t } = useTranslation(NsI18n.Listing);
  const [expanded, setExpanded] = useState(false);
  const copy = description || t('group.noDescription');
  return (
    <div className="mt-4">
      <p
        className={cn(
          'whitespace-pre-wrap text-sm leading-6 text-muted-foreground',
          !expanded && 'line-clamp-6',
        )}
      >
        {copy}
      </p>
      {copy.length > CLAMP_THRESHOLD ? (
        <Button
          type="button"
          variant="link"
          className="mt-1 h-11 px-0 text-primary"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? t('group.showLess') : t('group.showMore')}{' '}
          <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
        </Button>
      ) : null}
    </div>
  );
}
