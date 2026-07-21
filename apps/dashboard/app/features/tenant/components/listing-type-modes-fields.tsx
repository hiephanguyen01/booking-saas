import type { BookingMode, CreateListingTypeInput } from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { BOOKING_MODE_LABEL } from '~/constants/booking';

const ALL_MODES: BookingMode[] = ['hourly', 'daily', 'inventory', 'appointment', 'class'];

/**
 * The `allowedModes` + `defaultModes` checkbox groups, bound to the form via
 * `Controller`. Un-allowing a mode also prunes it from `defaultModes` and, when
 * it was the search schedule, resets `searchConfig.schedule` to `none` — the two
 * subset invariants the shared schema enforces.
 */
export function ListingTypeModesFields({ form }: { form: UseFormReturn<CreateListingTypeInput> }) {
  const errors = form.formState.errors;
  const fixedPackages = form.watch('bookingSelection') === 'fixed_packages';
  const modes = fixedPackages
    ? ALL_MODES.filter((mode) => mode === 'hourly' || mode === 'daily')
    : ALL_MODES;

  return (
    <Controller
      control={form.control}
      name="allowedModes"
      render={({ field }) => {
        const allowed = field.value ?? [];
        const toggle = (mode: BookingMode, on: boolean): void => {
          const next = on ? [...allowed, mode] : allowed.filter((m) => m !== mode);
          field.onChange(next);
          // Keep defaultModes a subset of allowedModes.
          if (!on) {
            const dm = form.getValues('defaultModes') ?? [];
            form.setValue(
              'defaultModes',
              dm.filter((m) => m !== mode),
            );
            if (form.getValues('searchConfig.schedule') === mode) {
              form.setValue('searchConfig.schedule', 'none', {
                shouldDirty: true,
                shouldValidate: true,
              });
            }
          }
        };
        return (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Hình thức đặt cho phép</h2>
            <div className="flex flex-wrap gap-4">
              {modes.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowed.includes(m)}
                    onCheckedChange={(v) => toggle(m, v === true)}
                  />
                  {BOOKING_MODE_LABEL[m]}
                </label>
              ))}
            </div>
            {errors.allowedModes ? (
              <p className="text-xs text-destructive">{String(errors.allowedModes.message)}</p>
            ) : null}

            <p className="pt-2 text-xs font-medium text-muted-foreground">
              Bật sẵn khi tạo tin đăng:
            </p>
            <Controller
              control={form.control}
              name="defaultModes"
              render={({ field: dmField }) => {
                const defaults = dmField.value ?? [];
                return (
                  <div className="flex flex-wrap gap-4">
                    {allowed.map((m) => (
                      <label key={m} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={defaults.includes(m)}
                          onCheckedChange={(v) =>
                            dmField.onChange(
                              v === true ? [...defaults, m] : defaults.filter((x) => x !== m),
                            )
                          }
                        />
                        {BOOKING_MODE_LABEL[m]}
                      </label>
                    ))}
                  </div>
                );
              }}
            />
          </section>
        );
      }}
    />
  );
}
