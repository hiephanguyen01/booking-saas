import { CircleCheck } from 'lucide-react';
import { useLoaderData } from 'react-router';
import { loadPartnerDone } from '../../lib/partner-onboarding.server';
import type { Route } from './+types/done';

export const meta = () => [{ title: 'Hoàn tất đăng ký · Booking Studio' }, { name: 'robots', content: 'noindex,nofollow' }];
export const loader = ({ request, params }: Route.LoaderArgs) => loadPartnerDone(request, params.locale);

export default function PartnerDone() {
  const { maskedEmail, dashboardUrl } = useLoaderData<typeof loader>();
  return (
    <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-10 sm:px-6 sm:pt-16">
      <section className="w-full max-w-[570px] bg-white p-8 text-center shadow-[0_4px_7.5px_rgba(0,0,0,0.07)] sm:p-10">
        <span className="mx-auto grid size-[104px] place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
          <CircleCheck className="size-14" strokeWidth={1.75} />
        </span>
        <h1 className="mt-10 text-2xl font-semibold uppercase leading-9">Hoàn tất đăng ký tài khoản</h1>
        <p className="mx-auto mt-5 max-w-[490px] text-sm font-medium leading-7 text-[#667085]">Hợp đồng đối tác và Thông tin tài khoản của bạn đã được gửi tới địa chỉ email: <strong className="font-semibold text-[#344054]">{maskedEmail}</strong></p>
        <a href={`${dashboardUrl}/auth/login`} className="mt-10 flex h-14 w-full items-center justify-center rounded-sm bg-primary text-base font-semibold text-primary-foreground transition hover:bg-primary/90">Trang quản lý</a>
      </section>
    </main>
  );
}
