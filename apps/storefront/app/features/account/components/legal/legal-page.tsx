import { AccountPanel } from '~/features/account/components/shared/account-primitives';

export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ title?: string; body: string }>;
}) {
  return (
    <AccountPanel className="p-(--sf-surface-pad) md:px-10 md:py-8 lg:px-15">
      <article className="mx-auto max-w-187.5 text-foreground">
        <h1 className="hidden text-center text-2xl font-semibold tracking-wide md:block">
          {title}
        </h1>
        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={`${section.title ?? 'intro'}-${section.body}`}>
              <h2 className="mb-2 text-base font-semibold">{section.title}</h2>
              <p className="text-sm leading-7 text-foreground/80 sm:text-base">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </AccountPanel>
  );
}
