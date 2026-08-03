import { Clock3, Tag } from 'lucide-react';
import { TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';

interface CalendarDialogTabsProps {
  canAvailability: boolean;
  canPricing: boolean;
}

/** Shared shadcn tabs for availability and private pricing. */
export function CalendarDialogTabs({ canAvailability, canPricing }: CalendarDialogTabsProps) {
  return (
    <TabsList aria-label="Loại thiết lập lịch">
      {canAvailability ? (
        <TabsTrigger value="availability">
          <Clock3 aria-hidden />
          Lịch mở cửa
        </TabsTrigger>
      ) : null}
      {canPricing ? (
        <TabsTrigger value="price">
          <Tag aria-hidden />
          Giá riêng
        </TabsTrigger>
      ) : null}
    </TabsList>
  );
}
