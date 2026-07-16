import { useState } from 'react';
import { useFetcher, data as routeData } from 'react-router';
import type { ReferralLinkResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { FORM_CONTROL } from '@booking/ui/components/form/control';
import { cn } from '@booking/ui/lib/utils';
import { Badge } from '@booking/ui/components/ui/badge';
import { Plus, Copy, Check, Trash2 } from 'lucide-react';
import type { Route } from './+types/links';
import { apiGet, apiPost, apiDelete } from '~/lib/api.server';
import { requireAffiliate } from './affiliate.server';

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  const links = active ? await apiGet<ReferralLinkResponse[]>('/affiliate/links', auth) : null;
  return {
    links: links?.ok ? (links.data ?? []) : [],
    storefrontUrl: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, active } = await requireAffiliate(request);
  if (!active) return routeData({ error: 'Chưa được duyệt.' }, { status: 403 });

  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (intent === 'create') {
    const res = await apiPost('/affiliate/links', { target: 'tenant_home' }, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được link.' }, { status: 400 });
    return { ok: true };
  }
  if (intent === 'delete') {
    const id = String(form.get('id'));
    const res = await apiDelete(`/affiliate/links/${id}`, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không xoá được link.' }, { status: 400 });
    return { ok: true };
  }
  return routeData({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
}

export default function AffiliateLinks({ loaderData }: Route.ComponentProps) {
  const { links, storefrontUrl } = loaderData;
  const createFetcher = useFetcher<typeof action>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Chia sẻ link giới thiệu — khách hàng đặt chỗ trong 30 ngày sau khi click sẽ được ghi nhận cho bạn.
        </p>
        <createFetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />
          <Button type="submit" size="sm" disabled={createFetcher.state !== 'idle'}>
            <Plus className="size-4" /> Tạo link mới
          </Button>
        </createFetcher.Form>
      </div>

      {links.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Chưa có link nào. Nhấn “Tạo link mới” để bắt đầu.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} storefrontUrl={storefrontUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkRow({ link, storefrontUrl }: { link: ReferralLinkResponse; storefrontUrl: string }) {
  const deleteFetcher = useFetcher<typeof action>();
  const [copied, setCopied] = useState(false);
  const url = `${storefrontUrl}/?ref=${encodeURIComponent(link.code)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — user can select manually */
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <Badge variant="outline" className="font-mono">
          {link.code}
        </Badge>
        <Input readOnly value={url} className={cn('min-w-0 flex-1 font-mono text-xs', FORM_CONTROL)} onFocus={(e) => e.currentTarget.select()} />
        <span className="text-xs text-muted-foreground">{link.clicksCount} click</span>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Đã chép' : 'Chép'}
        </Button>
        <deleteFetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={link.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={deleteFetcher.state !== 'idle'}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </deleteFetcher.Form>
      </CardContent>
    </Card>
  );
}
