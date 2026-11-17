import type { GlueDTO, WorkspaceDTO } from "../backend.ts";

/** Identifies a workspace by id, with its name and personal flag when they're known. */
export type WorkspaceRef =
  & Pick<WorkspaceDTO, "id">
  & Partial<Pick<WorkspaceDTO, "name" | "personal">>;

export function describeWorkspace(workspace: WorkspaceRef): string {
  if (workspace.name === undefined) {
    return workspace.id;
  }
  return workspace.personal
    ? `${workspace.name} (${workspace.id}, personal)`
    : `${workspace.name} (${workspace.id})`;
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
