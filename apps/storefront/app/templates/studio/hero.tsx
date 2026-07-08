import { Button } from '@booking/ui/components/ui/button';
import type { StorefrontTenant } from '../../lib/tenant.server';

/**
 * Studio-vertical template piece. Real search/slot-picker UI lands in Phase 1
 * (task 1.15); templates/ holds one folder per vertical (studio, rental,
 * classes) selected by tenants.vertical.
 */
export function StudioHero({ tenant }: { tenant: StorefrontTenant }) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold text-(--sf-primary)">{tenant.name}</h1>
      <p className="text-lg text-gray-600">
        Đặt studio, thiết bị và dịch vụ — nền tảng booking đa tenant.
      </p>
      <Button
        className="rounded-lg bg-(--sf-accent) px-6 py-3 font-medium text-white"
      >
        Khám phá
      </Button>
    </section>
  );
}
