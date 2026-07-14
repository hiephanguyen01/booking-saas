import { useState } from 'react';
import { Link } from 'react-router';
import { Calendar, ChevronDown, MapPin, Search, Users } from 'lucide-react';
import type { PublicListingTypeResponse } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { useT } from '../../lib/i18n';
import { typeIcon } from '../../lib/ui';

/**
 * The floating white search card on the home hero. The listing-type tabs are
 * real links (existing `/t/:slug` routing). Everything else — the
 * hourly/daily toggle, the 4 input-look fields, and the "Tìm kiếm" button —
 * is static/visual only: there's no backend search-by-location/date/guest
 * support today, so wiring them up would just produce a dead form.
 */
export function HeroSearchCard({ listingTypes }: { listingTypes: PublicListingTypeResponse[] }) {
  const { t } = useT();
  const [mode, setMode] = useState<'hourly' | 'daily'>('hourly');
  const types = listingTypes.slice(0, 6);

  return (
    <div className="rounded-lg bg-background shadow-lg">
      {types.length > 0 ? (
        <div className="grid grid-cols-3 gap-1 rounded-t-lg bg-muted/60 p-1 sm:flex sm:gap-0 sm:overflow-x-auto sm:bg-transparent sm:p-0">
          {types.map((type, i) => {
            const Icon = typeIcon(type.slug);
            const active = i === 0;
            return (
              <Link
                key={type.id}
                to={`/t/${type.slug}`}
                className={cn(
                  'flex shrink-0 flex-col items-center justify-center gap-1 rounded-t-lg px-2 py-3 text-xs font-medium transition-colors sm:flex-1 sm:px-4 sm:py-3 sm:text-base',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60',
                )}
              >
                <Icon className="size-5 text-primary sm:size-6" />
                {type.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setMode('hourly')}
            className={cn(
              'rounded-full border px-4 py-2.5 text-xs font-medium sm:text-sm',
              mode === 'hourly'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-border text-muted-foreground',
            )}
          >
            {t('home.bookHourly')}
          </button>
          <button
            type="button"
            onClick={() => setMode('daily')}
            className={cn(
              'rounded-full border px-4 py-2.5 text-xs font-medium sm:text-sm',
              mode === 'daily'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-border text-muted-foreground',
            )}
          >
            {t('home.bookDaily')}
          </button>
        </div>
        {mode === 'hourly' ? (
          <p className="text-xs font-medium text-emerald-600">{t('home.bookHourlyHint')}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end sm:gap-4">
          <label className="flex items-center gap-2 rounded-sm border border-input bg-background px-4 py-3">
            <Search className="size-5 text-muted-foreground" />
            <span className="truncate text-sm text-muted-foreground">{t('home.searchPlaceholder')}</span>
          </label>
          <button
            type="button"
            className="flex items-center gap-2 rounded-sm border border-input bg-background px-4 py-3 text-left"
          >
            <MapPin className="size-5 text-muted-foreground" />
            <span className="flex-1 truncate text-sm text-muted-foreground">{t('home.locationPlaceholder')}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
          <label className="flex items-center gap-2 rounded-sm border border-input bg-background px-4 py-3">
            <Calendar className="size-5 text-muted-foreground" />
            <span className="truncate text-sm text-foreground">
              {new Date().toLocaleDateString('vi-VN')}
            </span>
          </label>
          <button
            type="button"
            className="flex items-center gap-2 rounded-sm border border-input bg-background px-4 py-3 text-left"
          >
            <Users className="size-5 text-muted-foreground" />
            <span className="flex-1 truncate text-sm text-foreground">{t('home.guestsPlaceholder')}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="w-full rounded-sm bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:w-60"
          >
            {t('home.search')}
          </button>
        </div>
      </div>
    </div>
  );
}
