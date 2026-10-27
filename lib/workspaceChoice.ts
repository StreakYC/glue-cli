import type { GlueDTO, WorkspaceDTO } from "../backend.ts";

export function describeWorkspace(workspace: WorkspaceDTO): string {
  return workspace.personal
    ? `${workspace.name} (${workspace.id}, personal)`
    : `${workspace.name} (${workspace.id})`;
}

export type WorkspaceChoice =
  | { kind: "chosen"; workspace: WorkspaceDTO }
  | { kind: "ask"; options: WorkspaceDTO[] }
  | { kind: "error"; message: string };

/**
 * Decides which single workspace a command should act on: the one passed with
 * `--workspace`, otherwise the only eligible one, otherwise the user must be
 * asked.
 *
 * @param requested the `--workspace` option
 * @param eligible the workspaces the command can act on, in display order
 * @param all all of the user's workspaces
 * @param ineligibleReason explains why a requested workspace isn't eligible
 * @param noneEligibleMessage the error when no workspace is eligible
 */
export function chooseWorkspace(
  requested: string[] | undefined,
  eligible: WorkspaceDTO[],
  all: WorkspaceDTO[],
  ineligibleReason = "can't be used for this",
  noneEligibleMessage = "None of your workspaces can be used for this.",
): WorkspaceChoice {
  if (requested) {
    if (requested.length !== 1) {
      return { kind: "error", message: "This command needs exactly one --workspace id." };
    }
    const id = requested[0];
    if (!all.some((w) => w.id === id)) {
      return { kind: "error", message: `You're not a member of workspace ${id}.` };
    }
    const workspace = eligible.find((w) => w.id === id);
    if (!workspace) {
      return { kind: "error", message: `Workspace ${id} ${ineligibleReason}.` };
    }
    return { kind: "chosen", workspace };
  }
  if (eligible.length === 0) {
    return { kind: "error", message: noneEligibleMessage };
  }
  if (eligible.length === 1) {
    return { kind: "chosen", workspace: eligible[0] };
  }
  return { kind: "ask", options: eligible };
}

/**
 * Formats a glue's workspace for display, given the user's workspaces.
 */
export function workspaceNameForGlue(glue: GlueDTO, workspaces: WorkspaceDTO[]): string {
  return workspaces.find((w) => w.id === glue.workspaceId)?.name ?? glue.workspaceId;
}

/** The workspaces referenced by some items, for `--json` output envelopes. */
export function referencedWorkspaces(
  workspaceIds: Iterable<string>,
  workspaces: WorkspaceDTO[],
): WorkspaceDTO[] {
  const ids = new Set(workspaceIds);
  return workspaces.filter((w) => ids.has(w.id));
}

export function isSamePath(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;
}
