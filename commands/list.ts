import { getGlues } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green, red } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui.ts";
import { runStep } from "../ui.ts";

interface ListOptions {
  nameFilter?: string;
  format?: "table" | "json";
}

export const list = async (options: ListOptions) => {
  const glues = await runStep("Loading glues...", async () => {
    return await getGlues("deploy", options.nameFilter);
  });

  if (options.format === "json") {
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
