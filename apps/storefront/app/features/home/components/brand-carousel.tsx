import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { cn } from '@booking/ui/lib/utils';
import { useSyncExternalStore } from 'react';
import 'swiper/css';
import 'swiper/css/a11y';
import 'swiper/css/effect-coverflow';
import { A11y, EffectCoverflow, Keyboard } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

const LOOP_MIN_IMAGES = 5;
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_MEDIA_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getPrefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;
}

function getServerPrefersReducedMotion() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getPrefersReducedMotion,
    getServerPrefersReducedMotion,
  );
}

/**
 * The tenant's own promo artwork (`theme_config.carousel`), in two shapes.
 *
 * Desktop keeps the coverflow — it has the width for rotated slides to read as a
 * gallery. A phone does not: at 375px the same effect spends a full square of the
 * viewport showing one and a half images at an angle, so below `lg` it is a plain
 * scrolling rail of banner cards — two whole ones visible, no motion needed to be
 * legible, and the same gesture as the two listing rails under it.
 *
 * `lg` because that is where the rest of the storefront hands layout back to the
 * desktop treatment (`SiteBottomNav`, `SiteHeader`).
 *
 * Both spellings sit in the tree and CSS picks one. Swiper keeps its default
 * `resizeObserver`, so the copy that starts life inside a `display: none` box
 * measures itself the moment a resize past `lg` reveals it.
 */
export function BrandCarousel({ images, tenantName }: { images: string[]; tenantName: string }) {
  const { t } = useTranslation(NsI18n.Common);
  const prefersReducedMotion = usePrefersReducedMotion();
  const uniqueImages = [...new Set(images.filter(Boolean))];

  if (uniqueImages.length === 0) return null;

  const carouselLabel = t('home.carouselLabel', { tenant: tenantName });

  return (
    <section aria-label={carouselLabel}>
      <BrandPromoRail images={uniqueImages} />

      <div className="brand-coverflow-surface hidden lg:block">
        {uniqueImages.length === 1 ? (
          <div className="brand-coverflow-single">
            <BrandCarouselImage src={uniqueImages[0]} />
          </div>
        ) : (
          <Swiper
            key={prefersReducedMotion ? 'reduced-motion' : 'motion'}
            className="brand-coverflow"
            modules={[EffectCoverflow, Keyboard, A11y]}
            effect="coverflow"
            grabCursor
            centeredSlides
            centerInsufficientSlides={uniqueImages.length < LOOP_MIN_IMAGES}
            slidesPerView={1.25}
            breakpoints={{
              640: { slidesPerView: 2, coverflowEffect: { rotate: 50, stretch: 0 } },
              1024: { slidesPerView: 3, coverflowEffect: { rotate: 37, stretch: -31 } },
            }}
            speed={prefersReducedMotion ? 0 : 600}
            coverflowEffect={{
              rotate: 50,
              stretch: 0,
              depth: 100,
              modifier: 1,
              slideShadows: true,
            }}
            loop={uniqueImages.length >= LOOP_MIN_IMAGES}
            slideToClickedSlide
            keyboard={{ enabled: true, onlyInViewport: true }}
            a11y={{
              enabled: true,
              containerMessage: carouselLabel,
              prevSlideMessage: t('home.carouselPrevious'),
              nextSlideMessage: t('home.carouselNext'),
              slideLabelMessage: t('home.carouselGoTo', { slide: '{{index}}' }),
            }}
          >
            {uniqueImages.map((image) => (
              <SwiperSlide key={image}>
                <BrandCarouselImage src={image} />
              </SwiperSlide>
            ))}
          </Swiper>
        )}
      </div>
    </section>
  );
}

/** Phone/tablet shape: banner cards on a scroll rail. */
function BrandPromoRail({ images }: { images: string[] }) {
  return (
    // `-mx-4 px-4` so the rail bleeds to the screen edge while its first card
    // still lines up with the section headings above and below it.
    <div className="sf-scroll-x -mx-4 flex gap-3 px-4 sm:-mx-6 sm:px-6 lg:hidden">
      {images.map((image) => (
        <div
          key={image}
          className={cn(
            'relative aspect-[300/132] shrink-0 overflow-hidden bg-muted',
            'rounded-(--sf-surface-radius) shadow-(--sf-surface-shadow)',
            // A single image has nothing to scroll to, so it takes the full width
            // instead of sitting as a lone 300px card against empty space.
            images.length === 1 ? 'w-full' : 'w-75',
          )}
        >
          <Image
            src={image}
            alt=""
            width={900}
            height={396}
            draggable={false}
            className="size-full object-cover object-center"
          />
        </div>
      ))}
    </div>
  );
}

function BrandCarouselImage({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={700}
      height={700}
      draggable={false}
      className="size-full object-cover object-top"
    />
  );
}
