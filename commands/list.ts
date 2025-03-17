import { getGlues } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green, red } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";

interface ListOptions {
  nameFilter?: string;
  json?: boolean;
}

export const list = async (options: ListOptions) => {
  const glues = await runStep("Loading glues...", async () => {
    return await getGlues("deploy", options.nameFilter);
  });

  if (options.json) {
    console.log(JSON.stringify(glues, null, 2));
    return;
  }

  new Table()
    .header(["Name", "Running", "Created", "Last deployed"])
    .body(
      glues.map((
        glue,
      ) => [
        glue.name,
        glue.running ? green("RUNNING") : red("NOT RUNNING"),
        formatEpochMillis(glue.createdAt),
        glue.currentDeployment ? formatEpochMillis(glue.currentDeployment.createdAt) : "-",
      ]),
    )
    .padding(4)
    .render();
};
