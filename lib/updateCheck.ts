import type { UpgradeCommand } from "@cliffy/command/upgrade";
import { kv } from "../db.ts";

export const UPDATE_CHECK_KEY = ["update-check", "@streak-glue/cli"] as const;
export const CHANGELOG_URL = "https://github.com/StreakYC/glue-cli/releases";

interface UpdateNotice {
  currentVersion: string;
  latestVersion: string;
  checkedAt: number;
}

function startBackgroundUpdateCheck(
  currentVersion: string,
  upgradeCommand: UpgradeCommand,
): void {
  void (async () => {
    try {
      if (!await upgradeCommand.hasRequiredPermissions()) {
        return;
      }
      const latestVersion = await upgradeCommand.getLatestVersion();
      if (latestVersion !== currentVersion) {
        await kv.set(UPDATE_CHECK_KEY, {
          currentVersion,
          latestVersion,
          checkedAt: Date.now(),
        });
      }
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
  startBackgroundUpdateCheck(currentVersion, upgradeCommand);
  if (!Deno.stderr.isTerminal() || isJsonOutput) {
    return;
  }

  const notice = (await kv.get<UpdateNotice>(UPDATE_CHECK_KEY)).value;
  const hasNotice = !!notice;
  const noticeIsForCurrentVersion = notice?.currentVersion === currentVersion;

  if (!hasNotice) {
    return;
  }

  if (!noticeIsForCurrentVersion) {
    await kv.delete(UPDATE_CHECK_KEY);
    return;
  }

  const message = [
    "",
    `[glue] Update available: ${notice.latestVersion} (current ${notice.currentVersion})`,
    `       Run \`glue upgrade\` to update. Changelog: ${CHANGELOG_URL}`,
    "",
  ].join("\n");
  await Deno.stderr.write(new TextEncoder().encode(message));
}
