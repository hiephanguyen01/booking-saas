/**
 * The shared create/edit form chrome. Create surfaces compose `FormWizard`
 * (one section at a time, gated by `~/hooks/use-form-wizard`); edit surfaces
 * render every section and navigate with `WizardRail` + `~/hooks/
 * use-active-form-section`. Both draw their sections from the same
 * `WizardSection` shell, so a form looks the same on either surface.
 */

export { FormWizard } from './form-wizard';
export {
  WizardActions,
  WizardContextStrip,
  WizardNav,
  WizardSection,
  WizardStepErrors,
  WizardStepHint,
  type WizardStepItem,
} from './wizard-chrome';
export { FormRailMobileActions, FormRailMobileNav, WizardRail } from './wizard-rail';
