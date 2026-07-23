type ListingGroupMetaSource = {
  title: string;
  description?: string | null;
  photos: string[];
};

export function buildListingGroupMeta(group: ListingGroupMetaSource | undefined) {
  if (!group) return [{ title: 'Bài đăng' }];

  const description = group.description?.slice(0, 180) ?? group.title;
  const tags: Array<Record<string, string>> = [
    { title: group.title },
    { name: 'description', content: description },
    { property: 'og:title', content: group.title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
  ];

  if (group.photos[0]) tags.push({ property: 'og:image', content: group.photos[0] });
  return tags;
}
