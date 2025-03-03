function serializeValue(value: unknown, stack?: unknown[]): string {
  if (
    value == null ||
    typeof value === "number" || typeof value === "symbol" ||
    value instanceof WeakSet || value instanceof WeakMap
  ) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "function") {
    return value.name ? `[Function: ${value.name}]` : "[Function (anonymous)]";
  }
  if (value instanceof Error) {
    return value.stack ?? String(value);
  }

  // potentially recursive and fallible cases below

  if (!stack) {
    stack = [];
  }
  if (value != null && typeof value === "object") {
    if (stack.includes(value)) {
      return "[Circular reference]";
    }
    stack.push(value);
  }
  try {
    if (value instanceof Set) {
      return `Set(${value.size}) { ${Array.from(value).map((x) => serializeValue(x, stack)).join(", ")} }`;
    }
    if (value instanceof Map) {
      return `Map(${value.size}) { ${Array.from(value).map(([k, v]) => `${serializeValue(k, stack)} => ${serializeValue(v, stack)}`).join(", ")} }`;
    }
    return JSON.stringify(value);
  } catch {
    return "[Unserializable value]";
  } finally {
    if (value != null && typeof value === "object") {
      stack.pop();
    }
  }
}

function serializeValueAllowPlainStrings(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return serializeValue(value);
}

export function serializeConsoleArgumentsToString(args: unknown[]): string {
  return args.map(serializeValueAllowPlainStrings).join(" ") + "\n";
}
