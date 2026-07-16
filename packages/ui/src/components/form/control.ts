import { cn } from '@booking/ui/lib/utils';

/**
 * The platform's one form-control geometry.
 *
 * Height is 44px — the WCAG 2.5.8 / Apple HIG minimum touch target, which
 * shadcn's `h-9` (36px) default does not meet. Radius and text size are
 * deliberately NOT set here: radius stays on the primitives so it keeps tracking
 * the `--radius` token, and text size stays at their `text-base md:text-sm`,
 * which renders 16px on mobile so iOS Safari does not zoom the page on focus.
 *
 * Merge these LAST through `cn()` so `tailwind-merge` overrides the primitive's
 * own height. Every form control — rendered by `GenericForm` or hand-rolled in an
 * app — must use them: they are the only thing keeping the five input sizes that
 * once shipped side by side (h-9/10/11/13/14) from coming back.
 */

/** Inputs and native selects. */
export const FORM_CONTROL = 'h-11 px-4';

/** Textareas grow with their content, so they take a floor rather than a height. */
export const FORM_TEXTAREA = 'min-h-28 px-4 py-3';

/** The `InputGroup` wrapper owns the border and height; its children own padding. */
export const FORM_INPUT_GROUP = 'h-11';

/**
 * `Button`-based triggers (combobox, date picker).
 *
 * Needs its own constant because `Button`'s cva sets `has-[>svg]:px-3`, and every
 * trigger holds a chevron/calendar icon — so a bare `px-4` loses and the trigger
 * ends up 4px narrower inside than the `Input` beside it.
 */
export const FORM_TRIGGER = cn(FORM_CONTROL, 'w-full has-[>svg]:px-4');

/**
 * `SelectTrigger`.
 *
 * Needs its own constant because the primitive hides its height behind
 * `data-[size=default]:h-9` — a class+attribute selector at specificity (0,2,0),
 * which outranks a bare `.h-11` at (0,1,0) no matter the source order, and which
 * `tailwind-merge` cannot dedupe because the variant keys differ. Applying plain
 * `FORM_CONTROL` to a `SelectTrigger` therefore renders 36px silently; that is
 * exactly how a 56px partner form shipped with 36px selects in it.
 */
export const FORM_SELECT_TRIGGER = cn(FORM_CONTROL, 'w-full data-[size=default]:h-11');
