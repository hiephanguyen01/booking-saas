/**
 * Re-exports the react-hook-form primitives an app needs to build the custom
 * controls passed to `GenericForm`'s `extraFields` render-prop. Apps import these
 * from `@booking/ui/components/form/rhf` instead of depending on react-hook-form
 * directly (it's an encapsulated dependency of this package — see CLAUDE.md §8).
 */
export {
  Controller,
  useController,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form';
export type {
  Control,
  FieldErrors,
  FieldValues,
  Path,
  UseFormReturn,
  UseFormReturn as GenericFormApi,
} from 'react-hook-form';
