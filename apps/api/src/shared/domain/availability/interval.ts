/** A half-open UTC time interval `[start, end)`. */
export interface Interval {
  start: Date;
  end: Date;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function overlapsAny(candidate: Interval, intervals: readonly Interval[]): boolean {
  return intervals.some((i) => overlaps(candidate, i));
}

export function contains(outer: Interval, inner: Interval): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}
