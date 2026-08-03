import { useEffect, type ReactNode } from 'react';
import type { FormProgress, FormSectionMap } from '~/lib/form-progress';
import { WizardActions, WizardNav, WizardStepErrors } from './wizard-chrome';
import type { FormWizardController } from '~/hooks/use-form-wizard';

/**
 * The stepped create experience: context strip, the one visible section, its
 * error summary, the action bar and the step navigator. Callers supply the
 * rendered sections and a per-step validator; everything else — which step
 * shows, which are reachable, which show errors — comes from the controller.
 */
export function FormWizard<Id extends string, Values>({
  wizard,
  map,
  sections,
  progress,
  errors,
  busy,
  validateStep,
  contextStrip,
  finalLabel,
  secondaryFinalLabel,
  onFinal,
  onSecondaryFinal,
  footerNote,
  navTitle,
  navDescription,
}: {
  wizard: FormWizardController<Id>;
  map: FormSectionMap<Id, Values>;
  /** The rendered section bodies, keyed by section id. */
  sections: Record<Id, ReactNode>;
  progress: FormProgress<Id>;
  /** Live client-side validation errors (`form.formState.errors`). */
  errors?: unknown;
  busy: boolean;
  validateStep: (id: Id) => boolean | Promise<boolean>;
  contextStrip?: ReactNode;
  finalLabel: string;
  secondaryFinalLabel?: string;
  onFinal?: () => void;
  onSecondaryFinal?: () => void;
  /** Copy shown between the last section and the action bar. */
  footerNote?: ReactNode;
  navTitle?: string;
  navDescription?: string;
}) {
  const { current, index, furthestIndex, completed, attempted, retainCompleted } = wizard;
  const items = map.sections;
  const errorSections = map.getErrorSections(errors);

  const isComplete = (id: Id) =>
    (progress.items.find((item) => item.id === id)?.complete ?? false) && !errorSections.has(id);
  /** A step only shows its errors once the user has tried to leave it. */
  const showsError = (id: Id) => errorSections.has(id) && attempted.has(id);

  useEffect(() => {
    retainCompleted(isComplete);
  });

  const canNavigate = (target: number) =>
    target <= furthestIndex && items.slice(0, target).every((section) => isComplete(section.id));

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <div className="order-2 min-w-0 space-y-5 xl:order-1">
        {contextStrip}

        {current && showsError(current.id) ? (
          <WizardStepErrors messages={map.getSectionErrorMessages(errors, current.id)} />
        ) : null}

        {items.map((section, position) => (
          <div
            key={section.id}
            hidden={position !== index}
            className="animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
          >
            {sections[section.id]}
          </div>
        ))}

        {footerNote && index === items.length - 1 ? footerNote : null}

        <WizardActions
          currentIndex={index}
          total={items.length}
          busy={busy}
          finalLabel={finalLabel}
          secondaryFinalLabel={secondaryFinalLabel}
          onSecondaryFinal={onSecondaryFinal}
          onFinal={onFinal}
          onBack={wizard.goBack}
          onNext={() => void wizard.next(validateStep)}
        />
      </div>

      <div className="order-1 xl:order-2">
        <WizardNav
          items={items}
          currentIndex={index}
          completed={completed}
          canNavigate={canNavigate}
          onNavigate={(target) => {
            if (canNavigate(target)) wizard.goTo(target);
          }}
          title={navTitle}
          description={navDescription}
        />
      </div>
    </div>
  );
}
