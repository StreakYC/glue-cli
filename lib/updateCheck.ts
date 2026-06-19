import type { UpgradeCommand } from "@cliffy/command/upgrade";
import { kv } from "../db.ts";
import * as mod from "@std/fmt/colors";
import { compare, parse } from "@std/semver";

export const UPDATE_CHECK_KEY = ["update-check", "@streak-glue/cli"] as const;
export const CHANGELOG_URL = "https://github.com/StreakYC/glue-cli/releases";

interface CachedVersionCheck {
  latestVersion: string;
  checkedAt: number;
}

function startBackgroundUpdateCheck(upgradeCommand: UpgradeCommand): void {
  void (async () => {
    try {
      if (!await upgradeCommand.hasRequiredPermissions()) {
        return;
      }
      const latestVersion = await upgradeCommand.getLatestVersion();
      await kv.set(UPDATE_CHECK_KEY, {
        latestVersion,
        checkedAt: Date.now(),
      });
    } catch {
      // Update checks should never affect the command that triggered them.
    }
  })();
}

export async function maybeShowUpdateNotice(
  currentVersion: string,
  upgradeCommand: UpgradeCommand,
  isJsonOutput: boolean,
): Promise<void> {
  try {
    startBackgroundUpdateCheck(upgradeCommand);
    if (!Deno.stderr.isTerminal() || isJsonOutput) {
      return;
    }

    const cachedVersionCheck = (await kv.get<CachedVersionCheck>(UPDATE_CHECK_KEY)).value;

    if (!cachedVersionCheck) {
      return;
    }

    if (compare(parse(cachedVersionCheck.latestVersion), parse(currentVersion)) <= 0) {
      return;
    }

    const message = `Update available: ${mod.bold(cachedVersionCheck.latestVersion)} (current ${
      mod.bold(currentVersion)
    })
      Run \`glue upgrade\` to update. Changelog: ${mod.bold(CHANGELOG_URL)}
  `;
    console.error(mod.yellow(message));
  } catch (_e) {
    // do nothing, we never want the update check to affect the command that triggered it
  }
}
