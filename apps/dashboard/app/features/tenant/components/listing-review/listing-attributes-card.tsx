import type { ReactNode } from 'react';
import type { AttributeFieldType, ListingResponse, ListingTypeResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';

/**
 * "Thuộc tính" — the listing's dynamic attributes, labelled via its listing
 * type's attribute schema. When the type failed to load the card degrades to
 * raw keys with a warning caption. Renders nothing without attributes.
 */
export function ListingAttributesCard({
  listing,
  type,
  typeFailed,
}: {
  listing: ListingResponse;
  type: ListingTypeResponse | null;
  typeFailed: boolean;
}) {
  const entries = Object.entries(listing.attributes ?? {});
  if (entries.length === 0) return null;

  const fields = type?.attributeSchema ?? [];
  const labelOf = (key: string): string => fields.find((f) => f.key === key)?.label ?? key;
  const typeOf = (key: string): AttributeFieldType | undefined =>
    fields.find((f) => f.key === key)?.type;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thuộc tính</CardTitle>
        {typeFailed ? (
          <CardDescription className="text-warning">
            Không tải được nhãn thuộc tính — đang hiển thị khoá gốc.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <DetailGrid columns={3}>
          {entries.map(([key, value]) => (
            <DetailField key={key} label={labelOf(key)} value={formatAttrValue(value, typeOf(key))} />
          ))}
        </DetailGrid>
      </CardContent>
    </Card>
  );
}

function formatAttrValue(value: unknown, type?: AttributeFieldType): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null;
  if (typeof value === 'boolean' || type === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}
