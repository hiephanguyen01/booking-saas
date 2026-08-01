import { A11y, EffectCoverflow, Keyboard } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/a11y';
import 'swiper/css/effect-coverflow';
import { useSyncExternalStore } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';

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

export function BrandCarousel({ images, tenantName }: { images: string[]; tenantName: string }) {
  const { t } = useTranslation(NsI18n.Common);
  const prefersReducedMotion = usePrefersReducedMotion();
  const uniqueImages = [...new Set(images.filter(Boolean))];

  if (uniqueImages.length === 0) return null;

  const carouselLabel = t('home.carouselLabel', { tenant: tenantName });

  return (
    <section className="brand-coverflow-surface" aria-label={carouselLabel}>
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
    </section>
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
      className="size-full object-cover"
    />
  );
}
