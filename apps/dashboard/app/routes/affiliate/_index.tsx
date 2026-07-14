import type { AffiliateStatsResponse } from '@booking/contracts';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { MousePointerClick, ShoppingBag, Percent, Wallet } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireAffiliate } from './affiliate.server';
import { formatVnd } from '../tenant/format';

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  if (!active) return { stats: null };
  const res = await apiGet<AffiliateStatsResponse>('/affiliate/stats', auth);
  return { stats: res.ok ? res.data : null };
}

export default function AffiliateOverview({ loaderData }: Route.ComponentProps) {
  const { stats } = loaderData;
  if (!stats) {
    return <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>;
  }

  const conversionPct = (stats.conversionRate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<MousePointerClick className="size-4" />} label="Lượt click" value={String(stats.clicks)} />
        <StatCard icon={<ShoppingBag className="size-4" />} label="Đơn đặt" value={String(stats.bookings)} />
        <StatCard icon={<Percent className="size-4" />} label="Tỷ lệ chuyển đổi" value={`${conversionPct}%`} />
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Đã nhận"
          value={formatVnd(stats.paidCommission)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <CommissionCard label="Chờ xác nhận" value={formatVnd(stats.pendingCommission)} tone="muted" />
        <CommissionCard label="Đã xác nhận (sẽ trả)" value={formatVnd(stats.confirmedCommission)} tone="positive" />
        <CommissionCard label="Đã trả" value={formatVnd(stats.paidCommission)} tone="default" />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function CommissionCard({ label, value, tone }: { label: string; value: string; tone: 'muted' | 'positive' | 'default' }) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
