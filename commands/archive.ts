import { runStep } from "../ui/utils.ts";
import { askUserForGlues } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getGlueByName, type GlueDTO, updateGlue } from "../backend.ts";

export const archive = async (_options: unknown, ...glueNames: string[]) => {
  await checkForAuthCredsOtherwiseExit();
  let glues: GlueDTO[] = [];
  if (glueNames.length) {
    const gluePromises = glueNames.map((n) => getGlueByName(n, "deploy"));
    const resolvedGlues = await runStep(`Loading glue${glueNames.length === 1 ? "" : "s"}...`, () => Promise.all(gluePromises));
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
    glues = await askUserForGlues();
  } else {
    throw new Error("You must provide one or more glue names when not running in a terminal");
  }

  const updatePromises = glues.map((glue) => {
    return runStep(`Archiving glue ${glue.name}`, () => {
      if (glue.currentDeployment) {
        throw new Error(`glue still running, stop first with \`glue stop ${glue.name}\``);
      }
      if (glue.tags.includes("archived")) {
        throw new Error("already archived");
      }
      const newTags = [...glue.tags, "archived"];
      return updateGlue(glue.id, { tags: newTags });
    });
  });
  console.log();
  try {
    await Promise.all(updatePromises);
    console.log("All glues archived");
  } catch (_e) {
    console.log("some glues failed to archive");
    Deno.exit(1);
  }
};
