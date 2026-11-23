import { exists } from "@std/fs/exists";
import { parse as parseJsonc } from "@std/jsonc";
import * as path from "@std/path";
import z from "zod";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const AgeSetting = z.union([z.number(), z.string()]);
type AgeSetting = z.infer<typeof AgeSetting>;

const DenoJson = z.object({
  minimumDependencyAge: z.union([
    AgeSetting,
    z.object({
      age: AgeSetting.optional(),
      exclude: z.array(z.string()).optional(),
    }),
  ]).optional(),
});

export interface MinimumDependencyAgeEnvironment {
  now?: Date;
  homeDir?: string;
}

/**
 * Returns true if Deno's minimum dependency age policy would refuse to install
 * a version of `packageSpecifier` (such as "jsr:@scope/name") that was
 * published at `publishedAt`.
 *
 * Deno takes the setting from the first of these that has it:
 * 1. `minimumDependencyAge` in deno.json
 * 2. `min-release-age` in an .npmrc file next to deno.json
 * 3. `min-release-age` in ~/.npmrc
 * 4. a default of one day (Deno 2.9 and later)
 *
 * Pass `undefined` for `denoJsonPath` when the project has no deno.json; only
 * the last two sources are then checked.
 */
export async function isBlockedByMinimumDependencyAge(
  packageSpecifier: string,
  publishedAt: Date,
  denoJsonPath: string | undefined,
  environment: MinimumDependencyAgeEnvironment = {},
): Promise<boolean> {
  const now = environment.now ?? new Date();
  const cutoff = await findCutoff(packageSpecifier, denoJsonPath, now, environment);
  return cutoff !== undefined && publishedAt.getTime() > cutoff.getTime();
}

/**
 * Returns the cutoff date after which published versions are blocked, or
 * `undefined` if none.
 */
async function findCutoff(
  packageSpecifier: string,
  denoJsonPath: string | undefined,
  now: Date,
  environment: MinimumDependencyAgeEnvironment,
): Promise<Date | undefined> {
  if (denoJsonPath) {
    const denoJson = DenoJson.safeParse(parseJsonc(await Deno.readTextFile(denoJsonPath)));
    if (!denoJson.success) {
      // Deno fails on a malformed minimumDependencyAge anyway, so don't suggest a flag override.
      return undefined;
    }
    const setting = denoJson.data.minimumDependencyAge;
    if (typeof setting === "object") {
      if (setting.exclude?.includes(packageSpecifier) || setting.age === undefined) {
        return undefined;
      }
      return cutoffFromAgeSetting(setting.age, now);
    }
    if (setting !== undefined) {
      return cutoffFromAgeSetting(setting, now);
    }
  }

  const homeDir = environment.homeDir ?? Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  const npmrcDirs = [denoJsonPath && path.dirname(denoJsonPath), homeDir];
  for (const dir of npmrcDirs) {
    if (!dir) {
      continue;
    }
    const days = await readNpmrcMinReleaseAgeDays(path.join(dir, ".npmrc"));
    if (days !== undefined) {
      return new Date(now.getTime() - days * DAY_MS);
    }
  }

  // Use Deno's default of one day (Deno 2.9 and later)
  return new Date(now.getTime() - DAY_MS);
}

/**
 * Converts a `minimumDependencyAge` age setting to a cutoff date, or
 * `undefined` if the value is invalid (Deno rejects those itself). Accepts
 * integer minutes, whole-unit ISO-8601 durations (`W`/`D`/`H`/`M`/`S` only: no
 * years, months, or fractions), or an absolute date / RFC 3339 timestamp.
 */
function cutoffFromAgeSetting(value: AgeSetting, now: Date): Date | undefined {
  if (typeof value === "number" || /^\d+$/.test(value)) {
    return new Date(now.getTime() - Number(value) * MINUTE_MS);
  }
  const duration = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (duration) {
    const [weeks, days, hours, minutes, seconds] = duration.slice(1).map((part) =>
      Number(part ?? 0)
    );
    const durationMs = (weeks * 7 + days) * DAY_MS + (hours * 60 + minutes) * MINUTE_MS +
      seconds * 1000;
    return new Date(now.getTime() - durationMs);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function readNpmrcMinReleaseAgeDays(npmrcPath: string): Promise<number | undefined> {
  if (!await exists(npmrcPath)) {
    return undefined;
  }
  const match = /^\s*min-release-age\s*=\s*["']?(\d+)["']?\s*$/m.exec(
    await Deno.readTextFile(npmrcPath),
  );
  return match ? Number(match[1]) : undefined;
}
