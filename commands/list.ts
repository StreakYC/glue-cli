import { getGlues } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green, red } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
interface ListOptions {
  nameFilter?: string;
  json?: boolean;
}

export const list = async (options: ListOptions) => {
  await checkForAuthCredsOtherwiseExit();

  if (options.json) {
    const glues = await getGlues("deploy", options.nameFilter);
    console.log(JSON.stringify(glues, null, 2));
    return;
  } else {
    const glues = await runStep("Loading glues...", async () => {
      return await getGlues("deploy", options.nameFilter);
    });
    new Table()
      .header(["Name", "Running", "Runs", "Last run", "Last deployed"])
      .body(
        glues.map((
          glue,
        ) => [
          glue.name,
          glue.running ? green("RUNNING") : red("NOT RUNNING"),
          glue.executionSummary.count,
          glue.executionSummary.mostRecent === 0 ? "-" : formatEpochMillis(glue.executionSummary.mostRecent),
          glue.currentDeployment ? formatEpochMillis(glue.currentDeployment.createdAt) : "-",
        ]),
      )
      .padding(4)
      .render();
  }
};
