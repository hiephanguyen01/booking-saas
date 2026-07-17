/** A centered muted one-liner for an overview card with nothing to show. */
export function EmptyLine({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
