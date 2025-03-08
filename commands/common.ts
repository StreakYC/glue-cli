import { getGlues } from "../backend.ts";
import { Select } from "@cliffy/prompt/select";
import { runStep } from "../ui.ts";

export async function askUserForGlue() {
  const glues = await runStep("Loading glues...", () => getGlues("deploy"));
  if (!glues) {
    return undefined;
  }
  return await Select.prompt({
    message: "Choose a glue",
    search: true,
    options: glues.map((glue) => ({ name: glue.name, value: glue })),
  });
}
