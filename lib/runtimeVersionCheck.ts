import * as path from "@std/path";
import z from "zod";
import { findDenoConfigPaths } from "./denoConfig.ts";
import { GLUE_RUNTIME_PACKAGE } from "../common.ts";

const GLUE_RUNTIME_JSR_SPECIFIER = `jsr:${GLUE_RUNTIME_PACKAGE}`;
const GLUE_RUNTIME_META_URL = `https://jsr.io/${GLUE_RUNTIME_PACKAGE}/meta.json`;

export interface OutdatedRuntimeInfo {
  currentVersion: string;
  latestVersion: string;
}

export async function getOutdatedStreakRuntimeVersion(
  filename: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OutdatedRuntimeInfo | undefined> {
  const { denoLockPath } = await findDenoConfigPaths(path.dirname(filename));
  if (!denoLockPath) {
    return undefined;
  }
  const currentVersion = extractStreakRuntimeVersionFromDenoLockText(
    await Deno.readTextFile(denoLockPath),
  );
  if (!currentVersion) {
    return undefined;
  }
  const latestVersion = await fetchLatestStreakRuntimeVersion(fetchImpl);
  if (latestVersion === currentVersion) {
    return undefined;
  }
  return { currentVersion, latestVersion };
}

const DenoLockFile = z.object({
  version: z.string(),
  specifiers: z.record(z.string(), z.string()).optional(),
});
type DenoLockFile = z.infer<typeof DenoLockFile>;

export function extractStreakRuntimeVersionFromDenoLockText(text: string): string | undefined {
  const parsed = DenoLockFile.parse(JSON.parse(text));
  if (!parsed.specifiers) {
    return undefined;
  }
  const searchString = `${GLUE_RUNTIME_JSR_SPECIFIER}@`;
  for (const [specifier, resolvedVersion] of Object.entries(parsed.specifiers)) {
    if (
      specifier === GLUE_RUNTIME_JSR_SPECIFIER ||
      specifier.startsWith(searchString)
    ) {
      return resolvedVersion;
    }
  }
  return undefined;
}

const JsrPackageMeta = z.object({
  scope: z.string(),
  name: z.string(),
  latest: z.string(),
});
type JsrPackageMeta = z.infer<typeof JsrPackageMeta>;

async function fetchLatestStreakRuntimeVersion(
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(GLUE_RUNTIME_META_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${GLUE_RUNTIME_META_URL}: ${response.status} ${response.statusText}`,
    );
  }
  const payload = JsrPackageMeta.parse(await response.json());
  return payload.latest;
}
