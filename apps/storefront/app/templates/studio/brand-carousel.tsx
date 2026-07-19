import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
} from '@booking/ui/components/ui/carousel';
import { useEffect, useState } from 'react';
import { NsI18n, useTranslation } from '../../lib/i18n';

const AUTOPLAY_MS = 5_000;

export function BrandCarousel({ images, tenantName }: { images: string[]; tenantName: string }) {
  const { t } = useTranslation(NsI18n.Common);
  const uniqueImages = [...new Set(images)];

  if (uniqueImages.length === 0) return null;

  return (
    <section aria-label={t('home.carouselLabel', { tenant: tenantName })}>
      <Carousel opts={{ loop: uniqueImages.length > 1 }} className="overflow-hidden">
        <CarouselContent className="ml-0">
          {uniqueImages.map((image) => (
            <CarouselItem key={image} className="pl-0">
              <img
                src={image}
                alt=""
                width={1400}
                height={480}
                loading="lazy"
                className="h-56 w-full object-cover sm:h-72 lg:h-80"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        {uniqueImages.length > 1 ? <BrandCarouselControls images={uniqueImages} /> : null}
      </Carousel>
    </section>
  );
}

function BrandCarouselControls({ images }: { images: string[] }) {
  const { t } = useTranslation(NsI18n.Common);
  const { api } = useCarousel();
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [api]);

  return (
    <>
      <CarouselPrevious
        aria-label={t('home.carouselPrevious')}
        className="left-4 border-0 bg-background/90 shadow-sm hover:bg-background"
      />
      <CarouselNext
        aria-label={t('home.carouselNext')}
        className="right-4 border-0 bg-background/90 shadow-sm hover:bg-background"
      />
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
        {images.map((image, index) => (
          <button
            key={image}
            type="button"
            aria-label={t('home.carouselGoTo', { slide: index + 1 })}
            aria-current={selected === index ? 'true' : undefined}
            className={
              selected === index
                ? 'h-2 w-8 rounded-full bg-(--sf-accent) shadow-sm'
                : 'size-2 rounded-full bg-background/80 shadow-sm'
            }
            onClick={() => api?.scrollTo(index)}
          />
        ))}
      </div>
    </>
  );
}
