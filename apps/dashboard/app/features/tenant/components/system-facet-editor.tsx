import type { ListingTypeSearchConfig } from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Label } from '@booking/ui/components/ui/label';
import { move, OrderButtons } from '~/components/order-buttons';

const SYSTEM_FACETS = [
  { value: 'price', label: 'Khoảng giá' },
  { value: 'location', label: 'Khu vực' },
  { value: 'amenities', label: 'Tiện ích' },
] as const;

type SystemFacet = ListingTypeSearchConfig['systemFacets'][number];

/** Enable/disable + reorder the storefront's built-in facets (price / location / amenities). */
export function SystemFacetEditor({
  config,
  updateConfig,
}: {
  config: ListingTypeSearchConfig;
  updateConfig: (config: ListingTypeSearchConfig) => void;
}) {
  const enabled = config.systemFacets;
  const ordered = [
    ...enabled,
    ...SYSTEM_FACETS.map((facet) => facet.value).filter((facet) => !enabled.includes(facet)),
  ];

  const toggle = (facet: SystemFacet, checked: boolean): void => {
    updateConfig({
      ...config,
      systemFacets: checked ? [...enabled, facet] : enabled.filter((current) => current !== facet),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">Bộ lọc hệ thống</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Bật và sắp xếp các bộ lọc lấy từ dữ liệu chuẩn của tin đăng.
        </p>
      </div>
      <div className="space-y-2">
        {ordered.map((value) => {
          const definition = SYSTEM_FACETS.find((facet) => facet.value === value)!;
          const checked = enabled.includes(value);
          const index = enabled.indexOf(value);
          return (
            <div
              key={value}
              className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2"
            >
              <Checkbox
                id={`system-facet-${value}`}
                checked={checked}
                onCheckedChange={(next) => toggle(value, next === true)}
              />
              <Label htmlFor={`system-facet-${value}`} className="flex-1 font-normal">
                {definition.label}
              </Label>
              {checked ? (
                <OrderButtons
                  label={definition.label}
                  index={index}
                  length={enabled.length}
                  onMove={(direction) =>
                    updateConfig({ ...config, systemFacets: move(enabled, index, direction) })
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
