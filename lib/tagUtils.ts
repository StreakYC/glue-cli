export function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  const normalized = tags.map((tag) => tag.trim())
    .filter((tag) => tag.length)
    .reduce((acc, tag) => acc.add(tag), new Set<string>());
  return Array.from(normalized);
}

export function addTags(tags: string[] | undefined, additions: string[]): string[] {
  return normalizeTags([...(tags || []), ...additions]);
}

export function removeTags(tags: string[] | undefined, removals: string[]): string[] {
  const tagsNormalized = normalizeTags(tags);
  const removalsNormalized = normalizeTags(removals);
  return tagsNormalized.filter((tag) => !removalsNormalized.includes(tag));
}
