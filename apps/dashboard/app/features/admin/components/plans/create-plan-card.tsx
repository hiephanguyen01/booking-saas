import { createPlanInputSchema } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { SuccessBanner } from '~/components/action-feedback';
import { planCreateFields } from './plan-form-fields';

/** "Tạo gói mới" card — the create GenericForm plus its scoped success/error surfaces. */
export function CreatePlanCard({
  ok,
  error,
  fieldErrors,
}: {
  ok: string | null;
  error: string | null;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null;
}) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Tạo gói mới</CardTitle>
        <CardDescription>Đặt giá và hạn mức cho gói.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SuccessBanner message={ok} />
        <GenericForm
          schema={createPlanInputSchema}
          fields={planCreateFields}
          submitLabel="Tạo gói"
          serverError={error}
          fieldErrors={fieldErrors}
          defaultValues={{
            name: '',
            priceMonthly: '',
            limits: {
              maxPartners: 0,
              maxListings: 0,
              maxBookingsPerMonth: 0,
              customDomain: false,
              affiliateModule: false,
            },
            isActive: true,
          }}
        />
      </CardContent>
    </Card>
  );
}
