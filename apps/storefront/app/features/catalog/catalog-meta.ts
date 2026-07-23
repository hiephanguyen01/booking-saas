type CatalogMetaSource = {
  type: { name: string };
  noIndex: boolean;
};

export function buildCatalogMeta(
  loaderData: CatalogMetaSource | undefined,
  typeSlug: string,
): Array<Record<string, string>> {
  return [
    { title: loaderData?.type.name ?? typeSlug },
    ...(loaderData?.noIndex ? [{ name: 'robots', content: 'noindex,follow' }] : []),
  ];
}
