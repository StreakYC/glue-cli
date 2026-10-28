import { type DeploymentStatus, getGlues, type GetGluesFilters } from "../backend.ts";
import { Table } from "@cliffy/table";
import { bold, dim, green, red, yellow } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import {
  getMyWorkspaces,
  referencedWorkspaces,
  workspaceNameForGlue,
  type WorkspaceOptions,
} from "../lib/workspaces.ts";

interface ListOptions extends WorkspaceOptions {
  name?: string;
  tag?: string[];
  excludeTags?: string[];
  all?: boolean;
  json?: boolean;
}

export const list = async (options: ListOptions) => {
  await checkForAuthCredsOtherwiseExit();

  const filters: GetGluesFilters = {
    environment: "deploy",
    excludeTags: ["archived"],
    workspaceIds: options.workspace,
  };

  if (options.name) {
    filters.name = options.name;
  }
  if (options.tag) {
    filters.includeTags = Array.from(new Set(options.tag.map((t) => t.trim())));
  }
  if (options.excludeTags) {
    filters.excludeTags = Array.from(
      new Set([...options.excludeTags, "archived"].map((t) => t.trim())),
    );
  }
  if (options.all) {
    filters.excludeTags = undefined;
  }

  if (options.json) {
    const [glues, workspaces] = await Promise.all([getGlues(filters), getMyWorkspaces()]);
    console.log(JSON.stringify(
      {
        glues,
        workspaces: referencedWorkspaces(glues.map((g) => g.workspaceId), workspaces),
      },
      null,
      2,
    ));
    return;
  } else {
    const [glues, workspaces] = await runStep(
      "Loading glues...",
      () => Promise.all([getGlues(filters), getMyWorkspaces()]),
    );
    // Only show workspaces when the glues span more than one.
    const showWorkspace = new Set(glues.map((g) => g.workspaceId)).size > 1;
    new Table()
      .header([
        "Name",
        ...(showWorkspace ? ["Workspace"] : []),
        "Running",
        "Runs",
        "Errors",
        "Last run",
        "Last deployed",
        "Tags",
      ])
      .body(
        glues.map((
          glue,
        ) => [
          bold(glue.name),
          ...(showWorkspace ? [workspaceNameForGlue(glue, workspaces)] : []),
          getRunningStringForDeploymentStatus(glue.currentDeployment?.status),
          glue.executionSummary.totalCount
            ? green(glue.executionSummary.totalCount.toString())
            : "-",
          glue.executionSummary.totalErrorCount
            ? red(glue.executionSummary.totalErrorCount.toString())
            : "-",
          dim(formatEpochMillis(glue.executionSummary.mostRecent)),
          dim(formatEpochMillis(glue.currentDeployment?.createdAt)),
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
