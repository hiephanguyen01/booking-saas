import { Camera } from 'lucide-react';
import type { StorefrontTenant } from '../../lib/tenant.server';

/**
 * Two-panel marketing promo row. Purely decorative — there's no
 * promotions/banner data model tied to the home page today (the backend
 * `Promotion` entity is a booking-time redemption code, not a listing-display
 * discount), so this is static copy using tenant branding where sensible.
 */
export function StudioPromoBanner({ tenant }: { tenant: StorefrontTenant }) {
  const image = tenant.hero.imageUrl ?? `https://picsum.photos/seed/${tenant.slug}-promo/600/600`;

  return (
    <section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="w-2/5 shrink-0">
            <img src={image} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {tenant.name}
            </span>
            <span className="font-serif text-3xl italic text-foreground sm:text-4xl">Special Offer</span>
            <span className="text-lg font-semibold text-primary">-1.000.000 vnd</span>
            <span className="text-xs text-muted-foreground">Khi đăng ký trước 1 tháng</span>
          </div>
        </div>
        <div className="flex items-center gap-4 overflow-hidden rounded-lg bg-primary/10 px-6 py-6">
          <div className="relative shrink-0 rounded-full border-4 border-primary p-1">
            <img src={image} alt="" className="size-24 rounded-full object-cover sm:size-28" />
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
              <Camera className="size-3.5" />
              {tenant.name}
            </div>
            <p className="text-lg leading-tight font-bold text-foreground sm:text-xl">
              CITI&rsquo;S BEST <span className="text-primary">PROFESSIONAL</span> PHOTOGRAPHY STUDIO
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
