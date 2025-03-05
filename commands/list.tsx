import { getGlues, GlueDTO } from "../backend.ts";
import { Spinner } from "jsr:@std/cli/unstable-spinner";
import { Table } from "@cliffy/table";
import { green, red } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui.ts";
interface ListOptions {
  nameFilter?: string;
  format?: "table" | "json";
}

export const list = async (options: ListOptions) => {
  const spinner = new Spinner({ message: "Loading glues...", color: "green" });
  spinner.start();
  const glues = await getGlues("deploy", options.nameFilter);
  spinner.stop();

  if (options.format === "json") {
    console.log(JSON.stringify(glues, null, 2));
    return;
  }

  new Table()
    .header(["Name", "State", "Created", "Last deployed"])
    .body(
      glues.map((
        glue,
      ) => [
        glue.name,
        colorizeState(glue.state),
        formatEpochMillis(glue.createdAt),
        glue.currentDeployment ? formatEpochMillis(glue.currentDeployment.createdAt) : "-",
      ]),
    )
    .padding(4)
    .render();
};

function colorizeState(state: string) {
  if (state === "running") return green(state);
  return red(state);
}
