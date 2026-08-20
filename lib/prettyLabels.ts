export function prettyLabels(labels: Record<string, string | undefined>): string {
  return Object.entries(labels)
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([key, value]) => {
      if (/[,"\\\n]/.test(value)) {
        value = JSON.stringify(value);
      }
      return `${key}=${value}`;
    })
    .join(", ");
}
