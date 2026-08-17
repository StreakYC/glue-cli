export function prettyLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => {
      if (/[,"\\\n]/.test(value)) {
        value = JSON.stringify(value);
      }
      return `${key}=${value}`;
    })
    .join(", ");
}
