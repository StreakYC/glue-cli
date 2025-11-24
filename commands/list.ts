import { type DeploymentStatus, getGlues } from "../backend.ts";
import { Table } from "@cliffy/table";
import { dim, green, red, yellow } from "@std/fmt/colors";
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
      .header(["Name", "Running", "Runs", "Errors", "Last run", "Last deployed", "Tags"])
      .body(
        glues.map((
          glue,
        ) => [
          glue.name,
          getRunningStringForDeploymentStatus(glue.currentDeployment?.status),
          glue.executionSummary.totalCount ? green(glue.executionSummary.totalCount.toString()) : "-",
          glue.executionSummary.totalErrorCount ? red(glue.executionSummary.totalErrorCount.toString()) : "-",
          formatEpochMillis(glue.executionSummary.mostRecent),
          formatEpochMillis(glue.currentDeployment?.createdAt),
          glue.tags.length ? glue.tags.join(", ") : "-",
        ]),
      )
      .padding(4)
      .render();
  }
};

export function getRunningStringForDeploymentStatus(status?: DeploymentStatus): string {
  switch (status) {
    case "pending":
      return yellow("BOOTING");
    case "committing":
      return yellow("COMMITTING");
    case "success":
      return green("RUNNING");
    case "failure":
      return red("FAILED");
    case "cancelled":
      return dim("CANCELLED");
    default:
      return dim("STOPPED");
  }
}
