import type { ListingRevisionResponse, RevisionDiffEntry } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { REVISION_FIELD_LABEL, REVISION_SECTION_LABEL } from '~/constants/listing-revision';
import { formatDateTime } from '~/lib/format';

/**
 * What the partner changed, field by field, so a reviewer reads a short diff
 * instead of re-reading the whole listing. Only changed fields appear (the API
 * computes the diff against the live record), grouped the way the partner's edit
 * form is laid out.
 */

const SECTION_ORDER = ['content', 'pricing', 'location', 'policy'] as const;

function isImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

/** Render one side of a change: primitives inline, photos as thumbs, objects as rows. */
function DiffValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">— trống —</span>;
  }
  if (typeof value === 'boolean') return <span>{value ? 'Có' : 'Không'}</span>;
  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>;
  if (isImageUrl(value)) {
    return <img src={value} alt="" className="size-14 rounded-md object-cover" loading="lazy" />;
  }
  if (typeof value === 'string') return <span className="break-words">{value}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">— trống —</span>;
    if (value.every(isImageUrl)) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="size-14 rounded-md object-cover"
              loading="lazy"
            />
          ))}
        </div>
      );
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {value.map((item, index) => (
          <li key={index}>
            <DiffValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <dl className="space-y-0.5">
      {Object.entries(value as Record<string, unknown>).map(([key, nested]) => (
        <div key={key} className="flex flex-wrap gap-1">
          <dt className="text-muted-foreground">{key}:</dt>
          <dd className="min-w-0">
            {typeof nested === 'object' && nested !== null ? (
              <code className="break-all text-xs">{JSON.stringify(nested)}</code>
            ) : (
              <DiffValue value={nested} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `attributes` and `modeConfig` are whole objects, and a partner usually touches
 * one key inside them. Flattening to leaf paths keeps the reviewer's eye on the
 * price that moved instead of a wall of unchanged JSON.
 */
function flattenLeaves(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (!isPlainObject(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, nested]) =>
    flattenLeaves(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function changedLeafPaths(before: unknown, after: unknown): string[] {
  const left = new Map(flattenLeaves(before));
  const right = new Map(flattenLeaves(after));
  const paths = new Set([...left.keys(), ...right.keys()]);
  return [...paths].filter(
    (path) => JSON.stringify(left.get(path) ?? null) !== JSON.stringify(right.get(path) ?? null),
  );
}

function SideBySide({ before, after }: { before: unknown; after: unknown }) {
  return (
    <>
      <div className="rounded-md bg-muted/40 p-2 text-sm leading-6">
        <DiffValue value={before} />
      </div>
      <ArrowRight
        className="hidden size-4 self-center text-muted-foreground md:block"
        aria-hidden
      />
      <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm leading-6">
        <DiffValue value={after} />
      </div>
    </>
  );
}

function DiffRow({ entry }: { entry: RevisionDiffEntry }) {
  const label = REVISION_FIELD_LABEL[entry.field] ?? entry.field;
  const rowClass =
    'grid gap-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)_1.5rem_minmax(0,1fr)] md:items-start md:gap-3';

  if (isPlainObject(entry.before) || isPlainObject(entry.after)) {
    const paths = changedLeafPaths(entry.before, entry.after);
    if (paths.length > 0) {
      const left = new Map(flattenLeaves(entry.before));
      const right = new Map(flattenLeaves(entry.after));
      return (
        <>
          {paths.map((path, index) => (
            <div key={path} className={rowClass}>
              <p className="text-sm font-medium">
                {index === 0 ? label : <span className="sr-only">{label}</span>}
                <span className="block font-mono text-xs font-normal text-muted-foreground">
                  {path}
                </span>
              </p>
              <SideBySide before={left.get(path) ?? null} after={right.get(path) ?? null} />
            </div>
          ))}
        </>
      );
    }
  }

  return (
    <div className={rowClass}>
      <p className="text-sm font-medium">{label}</p>
      <SideBySide before={entry.before} after={entry.after} />
    </div>
  );
}

export function RevisionDiffCard({
  revision,
  title = 'Thay đổi chờ duyệt',
  description,
}: {
  revision: ListingRevisionResponse;
  title?: string;
  description?: string;
}) {
  const sections = SECTION_ORDER.map((section) => ({
    section,
    entries: revision.diff.filter((entry) => entry.section === section),
  })).filter((group) => group.entries.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ??
            `Đối tác gửi lúc ${formatDateTime(revision.submittedAt)}. Bản đang hiển thị vẫn giữ nguyên cho tới khi bạn duyệt.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {sections.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">
            Không có trường nào khác so với bản đang hiển thị.
          </p>
        ) : (
          <div className="divide-y">
            {sections.map(({ section, entries }) => (
              <div key={section}>
                <p className="bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {REVISION_SECTION_LABEL[section] ?? section}
                </p>
                {entries.map((entry) => (
                  <DiffRow key={entry.field} entry={entry} />
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
