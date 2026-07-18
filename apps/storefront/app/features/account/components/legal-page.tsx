import { AccountPanel } from './account-primitives';

export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ title?: string; body: string }>;
}) {
  return (
    <AccountPanel className="px-6 py-8 sm:px-10 lg:px-15">
      <article className="mx-auto max-w-187.5 text-foreground">
        <h1 className="text-center text-2xl font-semibold tracking-wide">{title}</h1>
        <div className="mt-6 space-y-6">
          {sections.map((section, index) => (
            <section key={`${section.title ?? 'intro'}-${index}`}>
              <h2 className="mb-2 text-base font-semibold">{section.title}</h2>
              <p className="text-sm leading-7 text-foreground/80 sm:text-base">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </AccountPanel>
  );
}
