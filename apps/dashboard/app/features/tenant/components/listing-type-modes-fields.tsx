import type { BookingMode, CreateListingTypeInput } from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Switch } from '@booking/ui/components/ui/switch';
import { BOOKING_MODE_DESCRIPTION, BOOKING_MODE_LABEL } from '~/constants/booking';

const ALL_MODES: BookingMode[] = ['hourly', 'daily', 'inventory', 'appointment', 'class'];

/**
 * One row per booking mode. Availability and the create-listing default stay
 * together so the subset rule is visible instead of being split into two lists.
 */
export function ListingTypeModesFields({
  form,
}: {
  form: UseFormReturn<CreateListingTypeInput>;
}) {
  const errors = form.formState.errors;
  const fixedPackages = form.watch('bookingSelection') === 'fixed_packages';
  const defaults = form.watch('defaultModes') ?? [];
  const modes = fixedPackages
    ? ALL_MODES.filter((mode) => mode === 'hourly' || mode === 'daily')
    : ALL_MODES;

  return (
    <Controller
      control={form.control}
      name="allowedModes"
      render={({ field }) => {
        const allowed = field.value ?? [];

        const setAllowed = (mode: BookingMode, enabled: boolean): void => {
          const next = enabled
            ? [...allowed.filter((value) => value !== mode), mode]
            : allowed.filter((value) => value !== mode);
          field.onChange(next);

          if (!enabled) {
            form.setValue(
              'defaultModes',
              defaults.filter((value) => value !== mode),
              { shouldDirty: true, shouldValidate: true },
            );
            if (form.getValues('searchConfig.schedule') === mode) {
              form.setValue('searchConfig.schedule', 'none', {
                shouldDirty: true,
                shouldValidate: true,
              });
            }
          }
        };

        const setDefault = (mode: BookingMode, enabled: boolean): void => {
          form.setValue(
            'defaultModes',
            enabled
              ? [...defaults.filter((value) => value !== mode), mode]
              : defaults.filter((value) => value !== mode),
            { shouldDirty: true, shouldValidate: true },
          );
        };

        return (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/15 px-4 py-3">
              <p className="text-sm font-medium">Hình thức được hỗ trợ</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Bật những cách khách có thể đặt. “Bật sẵn” chỉ là lựa chọn mặc định khi đối tác tạo
                tin đăng mới và vẫn có thể thay đổi.
              </p>
            </div>

            <div className="grid gap-2">
              {modes.map((mode) => {
                const enabled = allowed.includes(mode);
                const defaultEnabled = defaults.includes(mode);
                const allowedId = `allowed-mode-${mode}`;
                const defaultId = `default-mode-${mode}`;

                return (
                  <div
                    key={mode}
                    className="grid gap-3 rounded-lg border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <label
                      htmlFor={allowedId}
                      className="flex min-w-0 cursor-pointer items-start gap-3"
                    >
                      <Checkbox
                        id={allowedId}
                        checked={enabled}
                        onCheckedChange={(checked) => setAllowed(mode, checked === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {BOOKING_MODE_LABEL[mode]}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                          {BOOKING_MODE_DESCRIPTION[mode]}
                        </span>
                      </span>
                    </label>

                    <div className="flex items-center justify-between gap-4 border-t pt-3 sm:min-w-40 sm:justify-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                      <label
                        htmlFor={defaultId}
                        className={enabled ? 'text-xs font-medium' : 'text-xs text-muted-foreground'}
                      >
                        Bật sẵn
                      </label>
                      <Switch
                        id={defaultId}
                        checked={enabled && defaultEnabled}
                        disabled={!enabled}
                        onCheckedChange={(checked) => setDefault(mode, checked)}
                        aria-label={`Bật sẵn ${BOOKING_MODE_LABEL[mode]} khi tạo tin đăng`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {errors.allowedModes ? (
              <p className="text-xs text-destructive">
                Hãy bật ít nhất một hình thức đặt.
              </p>
            ) : null}
            {errors.defaultModes ? (
              <p className="text-xs text-destructive">
                Lựa chọn bật sẵn phải thuộc các hình thức được hỗ trợ.
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
