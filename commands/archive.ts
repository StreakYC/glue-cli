import { runStep } from "../ui/utils.ts";
import { askUserForGlues } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { type GlueDTO, updateGlue } from "../backend.ts";
import { findGlueByName, type WorkspaceOptions } from "../lib/workspaces.ts";

export const archive = async (options: WorkspaceOptions, ...glueNames: string[]) => {
  await checkForAuthCredsOtherwiseExit();
  let glues: GlueDTO[] = [];
  if (glueNames.length) {
    // One at a time, since resolving an ambiguous name may prompt.
    const resolvedGlues = [];
    for (const name of glueNames) {
      resolvedGlues.push(await findGlueByName(name, "deploy", options));
    }
    glues = resolvedGlues.filter((g) => g !== undefined);
    if (glues.length !== glueNames.length) {
      resolvedGlues.forEach((g, n) => {
        if (!g) {
          console.error(`Glue ${glueNames[n]} not found.`);
        }
      });
      Deno.exit(1);
    }
  } else if (Deno.stdout.isTerminal()) {
    glues = await askUserForGlues(options);
  } else {
    throw new Error("You must provide one or more glue names when not running in a terminal");
  }

  let anyErrors = false;
  for (const glue of glues) {
    try {
      await runStep(`Archiving glue ${glue.name}`, () => {
        if (glue.currentDeployment) {
          throw new Error(`glue still running, stop first with \`glue stop ${glue.name}\``);
        }
        if (glue.tags.includes("archived")) {
          throw new Error("already archived");
        }
        const newTags = [...glue.tags, "archived"];
        return updateGlue(glue.id, { tags: newTags });
      });
    } catch (_e) {
      anyErrors = true;
    }
  }
  console.log();
  if (anyErrors) {
    console.log("some glues failed to archive");
    Deno.exit(1);
  }
};
