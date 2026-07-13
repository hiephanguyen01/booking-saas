/**
 * Storefront homepage carousel (§16.2). Images come from `theme_config.carousel`
 * (uploaded by the tenant in dashboard settings). A dependency-free, SSR-safe
 * scroll-snap gallery — renders nothing when the tenant configured no slides.
 */
export function StudioCarousel({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 pt-6" aria-label="Ảnh nổi bật">
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-3xl">
        {images.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt=""
            className="h-64 w-full flex-none snap-center rounded-3xl object-cover md:h-96"
          />
        ))}
      </div>
    </section>
  );
}
