export function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  const normalized = new Set(
    ...tags.map((t) => t.trim()).filter((t) => t.length),
  );
  return Array.from(normalized);
}

export function addTags(tags: string[] | undefined, additions: string[]): string[] {
  return normalizeTags([...(tags || []), ...additions]);
}

export function removeTags(tags: string[] | undefined, removals: string[]): string[] {
  const tagsNormalized = normalizeTags(tags);
  const removalsNormalized = normalizeTags(removals);
  return new Array(...new Set(tagsNormalized).difference(new Set(removalsNormalized)));
}
