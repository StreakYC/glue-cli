import { AsyncLocalStorage } from "node:async_hooks";
import { Awaitable } from "./common.ts";
import { serializeConsoleArgumentsToString } from "./logging/serialization.ts";

export interface Log {
  timestamp: number;
  type: "stdout" | "stderr";
  text: string;
}

interface LogContext {
  logs: Log[] | undefined;
}

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export function patchConsoleGlobal() {
  const regularConsoleMethods: Array<keyof typeof console> = ["log", "error", "warn", "info", "debug", "table"];
  for (const methodName of regularConsoleMethods) {
    const originalMethod = console[methodName];
    console[methodName] = (...args) => {
      const logs = asyncLocalStorage.getStore()?.logs;
      if (logs) {
        const timestamp = Date.now();
        const text = serializeConsoleArgumentsToString(args);
        logs.push({
          timestamp,
          type: methodName === "error" ? "stderr" : "stdout",
          text,
        });
      }
      return originalMethod.apply(console, args);
    };
  }

  const timingStarts = new Map<string, number>();
  console.time = (label = "default") => {
    timingStarts.set(label, Date.now());
  };
  console.timeEnd = (label = "default") => {
    const start = timingStarts.get(label);
    if (start === undefined) {
      console.warn(`Timer '${label}' does not exist`);
      return;
    }
    const duration = Date.now() - start;
    timingStarts.delete(label);
    console.log(`${label}: ${duration}ms`);
  };
}

/** Used by tests so tests don't have to patch the console global */
export function manualLog(log: Log) {
  const logs = asyncLocalStorage.getStore()?.logs;
  if (logs) {
    logs.push(log);
  } else {
    throw new Error("manualLog called outside of logging context");
  }
}

export async function runInLoggingContext<T>(fn: () => Awaitable<T>): Promise<{ result: T; logs: Log[] }> {
  const logs: Log[] = [];
  const logContext: LogContext = { logs };
  // TODO do we need to handle errors here?
  const result: T = await asyncLocalStorage.run(logContext, fn);
  logContext.logs = undefined;
  return { result, logs };
}
