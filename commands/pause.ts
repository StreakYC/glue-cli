import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getGlueByName, type GlueDTO, pauseGlue } from "../backend.ts";
import * as mod from "@std/fmt/colors";

export const pause = async (_options: unknown, name?: string) => {
  await checkForAuthCredsOtherwiseExit();
  let glue: GlueDTO | undefined;

  if (name) {
    glue = await runStep("Loading glue...", () => getGlueByName(name, "deploy"));
  } else if (Deno.stdout.isTerminal()) {
    glue = await askUserForGlue();
  } else {
    throw new Error("You must provide a glue name when not running in a terminal");
  }

  if (!glue) {
    const errorMsg = name ? `Glue ${name} not found` : "No glue found";
    throw new Error(errorMsg);
  }

  if (!glue.running) {
    console.log(`Glue ${glue.name} is not running`);
    return;
  }

  await runStep(`Pausing glue ${glue.name}...`, () => pauseGlue(glue.id));
  console.log(`\n\n${mod.bold(`glue describe ${glue.name}`)} for more details`);
};
