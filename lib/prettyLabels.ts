import { bold, dim } from "@std/fmt/colors";

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

export function prettyLabelsColoredForTables(labels: Record<string, string | undefined>): string {
  if (Object.keys(labels).length === 0) {
    return dim("-");
  }
  return Object.entries(labels)
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([key, value]) => {
      return `${dim(key)}: ${bold(value)}`;
    })
    .join("\n");
}
