import { cn } from '@booking/ui/lib/utils';
import { Camera } from 'lucide-react';
import type { StorefrontTenant } from '../../lib/tenant.server';

/**
 * Two-panel marketing promo row. Purely decorative — there's no
 * promotions/banner data model tied to the home page today (the backend
 * `Promotion` entity is a booking-time redemption code, not a listing-display
 * discount), so this is static copy using tenant branding where sensible.
 */
export function StudioPromoBanner({ tenant }: { tenant: StorefrontTenant }) {
  return (
    <section aria-label="Ưu đãi nổi bật">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="flex min-h-64 overflow-hidden bg-card shadow-[0_2px_15px_rgba(0,0,0,0.07)] sm:min-h-76">
          <div className="w-2/5 shrink-0">
            <img
              src="/images/booking-studio/home/promo-offer.jpg"
              alt="Cặp đôi chụp ảnh cưới trong studio"
              width={867}
              height={1300}
              className="size-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-4 py-6 text-center sm:px-7">
            <span className="text-lg font-normal text-[#616161] sm:text-2xl">ART STUDIO</span>
            <span className="font-promo-script pb-1 text-4xl leading-[1.1] text-[#101828] sm:text-5xl">
              Special Offer
            </span>
            <span className="text-xl font-semibold text-[#e22828] sm:text-2xl">-1.000.000 vnd</span>
            <span className="text-sm text-[#616161] sm:text-lg">Khi đăng ký trước 1 tháng</span>
          </div>
        </article>
        <article className="relative flex min-h-64 items-center gap-5 overflow-hidden bg-[#ffe1e1] px-5 py-6 shadow-[0_2px_15px_rgba(0,0,0,0.07)] sm:min-h-76 sm:px-8">
          <DotPattern className="left-5 top-5" />
          <div className="relative shrink-0 rounded-full border-4 border-[#e22828] p-1">
            <img
              src="/images/booking-studio/home/promo-photographer.png"
              alt="Nhiếp ảnh gia đang cầm máy ảnh"
              width={480}
              height={480}
              className="size-28 rounded-full object-cover sm:size-52"
            />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="mb-5 flex items-center justify-end gap-1 text-sm font-medium text-[#e22828] sm:text-lg">
              <Camera aria-hidden="true" className="size-5" />
              {tenant.name}
            </div>
            <p className="font-promo-mono text-base leading-tight font-bold text-[#101828] sm:text-2xl">
              CITI&rsquo;S BEST <span className="text-[#e22828]">PROFESSIONAL</span> PHOTOGRAPHY
              STUDIO
            </p>
          </div>
          <DotPattern className="right-5 bottom-5" />
        </article>
      </div>
    </section>
  );
}

function DotPattern({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={cn('absolute grid grid-cols-5 gap-1', className)}>
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index} className="size-1.5 rounded-full bg-[#1fcba2]" />
      ))}
    </span>
  );
}
