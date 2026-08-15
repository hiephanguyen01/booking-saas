import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';

export function DemosSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="demos"
      className="platform-section border-t border-border bg-secondary px-5 py-18 sm:px-6 sm:py-22"
    >
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal max-w-190">
          <h2 className="platform-heading">{t('demos.title')}</h2>
          <p className="platform-description mt-5">{t('demos.description')}</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <DemoFigure
            image="/studiohub/carousel/01.jpg"
            width="1200"
            height="1800"
            title={t('demos.studio.title')}
            description={t('demos.studio.description')}
            alt={t('demos.studio.alt')}
            label={t('demos.demoLabel')}
          />
          <DemoFigure
            image="/booking-stad/platform-courts.png"
            width="1568"
            height="1003"
            title={t('demos.sport.title')}
            description={t('demos.sport.description')}
            alt={t('demos.sport.alt')}
            label={t('demos.illustrationLabel')}
          />
        </div>
      </div>
    </section>
  );
}

function DemoFigure({
  image,
  width,
  height,
  title,
  description,
  alt,
  label,
}: {
  image: string;
  width: string;
  height: string;
  title: string;
  description: string;
  alt: string;
  label: string;
}) {
  return (
    <figure className="platform-section-reveal overflow-hidden rounded-[1.375rem] border border-border bg-card">
      <div className="overflow-hidden border-b border-border bg-muted">
        <Image
          src={image}
          width={width}
          height={height}
          alt={alt}
          className="aspect-[16/10] w-full object-cover"
        />
      </div>
      <figcaption className="p-7 sm:p-8">
        <p className="inline-flex rounded-full bg-(--platform-primary-soft) px-3 py-1.5 text-xs font-bold tracking-[0.05em] text-(--platform-primary-emphasis) uppercase">
          {label}
        </p>
        <h3 className="mt-4 text-[22px] font-bold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="mt-2 text-[15.5px] leading-6 text-muted-foreground">{description}</p>
      </figcaption>
    </figure>
  );
}
