import { NsI18n, useTranslation } from '@booking/i18n';

export function DemosSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="demos"
      className="platform-section border-t border-[#e7e9ed] bg-[#fbfbfc] px-5 py-18 sm:px-6 sm:py-22"
    >
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal max-w-190">
          <h2 className="platform-heading">{t('demos.title')}</h2>
          <p className="platform-description mt-5">{t('demos.description')}</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <DemoFigure
            image="/booking-studio/carousel/01.jpg"
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
    <figure className="platform-section-reveal overflow-hidden rounded-[1.375rem] border border-[#e4e6ea] bg-white">
      <div className="overflow-hidden border-b border-[#e4e6ea] bg-[#edeff2]">
        <img
          src={image}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          alt={alt}
          className="aspect-[16/10] w-full object-cover"
        />
      </div>
      <figcaption className="p-7 sm:p-8">
        <p className="inline-flex rounded-full bg-[#fff4de] px-3 py-1.5 text-xs font-bold tracking-[0.05em] text-[#b27400] uppercase">
          {label}
        </p>
        <h3 className="mt-4 text-[22px] font-bold tracking-[-0.02em] text-[#0a0e13]">{title}</h3>
        <p className="mt-2 text-[15.5px] leading-6 text-[#4a515b]">{description}</p>
      </figcaption>
    </figure>
  );
}
