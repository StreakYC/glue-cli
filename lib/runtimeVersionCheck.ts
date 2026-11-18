import z from "zod";
import type { DenoConfigPaths } from "./denoConfig.ts";
import { GLUE_RUNTIME_PACKAGE } from "../common.ts";
import {
  isBlockedByMinimumDependencyAge,
  type MinimumDependencyAgeEnvironment,
} from "./minimumDependencyAge.ts";

const GLUE_RUNTIME_JSR_SPECIFIER = `jsr:${GLUE_RUNTIME_PACKAGE}`;
const GLUE_RUNTIME_META_URL = `https://jsr.io/${GLUE_RUNTIME_PACKAGE}/meta.json`;

export interface OutdatedRuntimeInfo {
  currentVersion: string;
  latestVersion: string;
  /** True if Deno's minimum dependency age policy currently blocks `latestVersion`. */
  latestBlockedByMinimumDependencyAge: boolean;
}

export async function getOutdatedStreakRuntimeVersion(
  _filename: string,
  denoConfigPaths: DenoConfigPaths,
  fetchImpl: typeof fetch = fetch,
  environment: MinimumDependencyAgeEnvironment = {},
): Promise<OutdatedRuntimeInfo | undefined> {
  if (!denoConfigPaths.denoJsonPath || !denoConfigPaths.denoLockPath) {
    return undefined;
  }
  const currentVersion = extractStreakRuntimeVersionFromDenoLockText(
    await Deno.readTextFile(denoConfigPaths.denoLockPath),
  );
  if (!currentVersion) {
    return undefined;
  }
  const meta = await fetchStreakRuntimeMeta(fetchImpl);
  const latestVersion = meta.latest;
  if (latestVersion === currentVersion) {
    return undefined;
  }
  const publishedAt = meta.versions?.[latestVersion]?.createdAt;
  const latestBlockedByMinimumDependencyAge = publishedAt !== undefined &&
    await isBlockedByMinimumDependencyAge(
      GLUE_RUNTIME_JSR_SPECIFIER,
      new Date(publishedAt),
      denoConfigPaths.denoJsonPath,
      environment,
    );
  return { currentVersion, latestVersion, latestBlockedByMinimumDependencyAge };
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
  versions: z.record(z.string(), z.object({ createdAt: z.string().optional() })).optional(),
});
type JsrPackageMeta = z.infer<typeof JsrPackageMeta>;

async function fetchStreakRuntimeMeta(
  fetchImpl: typeof fetch,
): Promise<JsrPackageMeta> {
  const response = await fetchImpl(GLUE_RUNTIME_META_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${GLUE_RUNTIME_META_URL}: ${response.status} ${response.statusText}`,
    );
  }
  return JsrPackageMeta.parse(await response.json());
}
