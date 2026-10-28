import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { type GlueDTO, stopGlue } from "../backend.ts";
import { findGlueByName, type WorkspaceOptions } from "../lib/workspaces.ts";
import * as mod from "@std/fmt/colors";

export const stop = async (options: WorkspaceOptions, name?: string) => {
  await checkForAuthCredsOtherwiseExit();
  let glue: GlueDTO | undefined;

  if (name) {
    glue = await findGlueByName(name, "deploy", options);
  } else if (Deno.stdout.isTerminal()) {
    glue = await askUserForGlue(options);
  } else {
    throw new Error("You must provide a glue name when not running in a terminal");
  }

  if (!glue) {
    const errorMsg = name ? `Glue ${name} not found` : "No glue found";
    throw new Error(errorMsg);
  }

  if (!glue.currentDeployment) {
    console.log(`Glue ${glue.name} is already stopped`);
    return;
  }

  await runStep(`Stopping glue ${glue.name}...`, () => stopGlue(glue.id));
  console.log(`\n\n${mod.bold(`glue describe ${glue.name}`)} for more details`);
};
