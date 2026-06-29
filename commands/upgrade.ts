import { UpgradeCommand } from "@cliffy/command/upgrade";
import { JsrProvider } from "@cliffy/command/upgrade/provider/jsr";
import { updateInstalledSkills } from "./skills.ts";

class GlueUpgradeCommand extends UpgradeCommand {
  constructor(options: ConstructorParameters<typeof UpgradeCommand>[0]) {
    super(options);

    const originalAction = this.settings.actionHandler;
    if (!originalAction) {
      throw new Error("Unable to configure upgrade command");
    }

    this.action(async function (options, ...args) {
      await originalAction.call(this, options, ...args);
      try {
        await updateInstalledSkills();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update Glue skill: ${message}`);
      }
    });
  }
}

export const upgradeCommand = new GlueUpgradeCommand({
  provider: [
    new JsrProvider({ scope: "streak-glue", name: "cli" }),
  ],
  args: [
    "--no-config",
    "--minimum-dependency-age=0",
    "--unstable-kv",
    "--allow-all",
  ],
});
