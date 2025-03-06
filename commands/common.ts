import { getGlues } from "../backend.ts";
import { Select } from "@cliffy/prompt/select";
import { runStep } from "../ui.ts";

export async function askUserForGlue() {
  const glues = await runStep("Loading glues...", async () => {
    const glues = await getGlues("deploy");
    if (glues.length === 0) {
      throw new Error("No glues found");
    }
    return glues;
  });
  return await Select.prompt({
    message: "Choose a glue",
    search: true,
    options: glues.map((glue) => ({ name: glue.name, value: glue })),
  });
}
