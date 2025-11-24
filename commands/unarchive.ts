import { runStep } from "../ui/utils.ts";
import { askUserForGlues } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getGlueByName, type GlueDTO, updateGlue } from "../backend.ts";

export const unarchive = async (_options: unknown, ...glueNames: string[]) => {
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

  let anyErrors = false;
  for (const glue of glues) {
    try {
      await runStep(`Unarchiving glue ${glue.name}`, () => {
        if (!glue.tags.includes("archived")) {
          throw new Error("not archived");
        }
        const newTags = glue.tags.filter((t) => t !== "archived");
        return updateGlue(glue.id, { tags: newTags });
      });
    } catch (_e) {
      anyErrors = true;
    }
  }
  console.log();
  if (anyErrors) {
    console.log("some glues failed to unarchive");
    Deno.exit(1);
  }
};
