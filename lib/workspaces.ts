import { UserFacingError } from "./UserFacingError.ts";
import { Select } from "@cliffy/prompt/select";
import {
  getGluesByName,
  getWorkspaces,
  type GlueDTO,
  type GlueEnvironment,
  type WorkspaceDTO,
} from "../backend.ts";
import { GLUE_API_SERVER } from "../common.ts";
import { kv } from "../db.ts";
import { runStep } from "../ui/utils.ts";
import { describeWorkspace, type WorkspaceRef } from "./workspaceChoice.ts";

export {
  describeWorkspace,
  referencedWorkspaces,
  workspaceNameForGlue,
  type WorkspaceRef,
} from "./workspaceChoice.ts";

/** The global `--workspace` option, which takes a single id. */
export interface WorkspaceOptions {
  workspace?: string;
}

/** Adds the `--workspaces` option of list commands, which takes several workspace ids. */
export interface WorkspacesOptions extends WorkspaceOptions {
  workspaces?: string[];
}

/** Returns the workspace ids a list command should filter by, if any were passed. */
export function workspaceIdsToList(options: WorkspacesOptions): string[] | undefined {
  return options.workspaces ?? (options.workspace ? [options.workspace] : undefined);
}

export const WORKSPACE_ID_REGEX = /^w_[0-9a-f]+$/;

let workspacesPromise: Promise<WorkspaceDTO[]> | undefined;

/** The user's workspaces, loaded once per process. */
export function getMyWorkspaces(): Promise<WorkspaceDTO[]> {
  workspacesPromise ??= getWorkspaces();
  return workspacesPromise;
}

/**
 * Picks the single workspace a command acts on: the one passed with
 * `--workspace`, otherwise the only candidate, otherwise the user is asked in
 * a terminal.
 *
 * A `--workspace` id is returned as given, without loading the user's
 * workspaces, so it's the server that accepts or rejects it.
 */
export async function pickWorkspace(
  options: WorkspaceOptions,
  config: {
    /** e.g. "deploy to" or "invite to" */
    purpose: string;
    /** picks the workspaces to offer; defaults to all of the user's workspaces */
    candidates?: (mine: WorkspaceDTO[]) => WorkspaceRef[] | Promise<WorkspaceRef[]>;
    /** the error when there are no workspaces to offer */
    noCandidatesMessage?: string;
  },
): Promise<WorkspaceRef> {
  if (options.workspace) {
    return { id: options.workspace };
  }
  const mine = await getMyWorkspaces();
  const candidates = config.candidates ? await config.candidates(mine) : mine;
  if (candidates.length === 0) {
    throw new UserFacingError(
      config.noCandidatesMessage ?? "None of your workspaces can be used for this.",
    );
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return await askForWorkspace(candidates, `Which workspace do you want to ${config.purpose}?`);
}

async function askForWorkspace(options: WorkspaceRef[], message: string): Promise<WorkspaceRef> {
  if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) {
    throw new UserFacingError(
      `${message} Pass one with --workspace:\n${
        options.map((w) => ` - ${describeWorkspace(w)}`).join("\n")
      }`,
    );
  }
  return await Select.prompt({
    message,
    search: true,
    options: options.map((w) => ({ name: describeWorkspace(w), value: w })),
  });
}

/**
 * Finds the glue with a name, in the `--workspace` workspace or all of the
 * user's workspaces. If several workspaces have a glue with that name, the
 * user picks one (or must pass `--workspace` outside a terminal).
 *
 * Shows its own spinner while loading, so callers shouldn't wrap it in
 * `runStep` (a spinner would garble the prompt).
 */
export async function findGlueByName(
  name: string,
  environment: GlueEnvironment,
  options: WorkspaceOptions,
  config: { quiet?: boolean } = {},
): Promise<GlueDTO | undefined> {
  const matches = await runStep(
    `Loading glue ${name}...`,
    () => getGluesByName(name, environment, options.workspace ? [options.workspace] : undefined),
    true,
    config.quiet,
  );
  if (matches.length <= 1) {
    return matches[0];
  }
  const workspaces = await getMyWorkspaces();
  const workspaceFor = (glue: GlueDTO) => workspaces.find((w) => w.id === glue.workspaceId);
  const describe = (glue: GlueDTO) => {
    const workspace = workspaceFor(glue);
    return workspace ? describeWorkspace(workspace) : glue.workspaceId;
  };
  if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) {
    throw new UserFacingError(
      `More than one workspace has a glue named ${
        JSON.stringify(name)
      }, so pass one with --workspace:\n${matches.map((g) => ` - ${describe(g)}`).join("\n")}`,
    );
  }
  return await Select.prompt({
    message: `More than one workspace has a glue named ${JSON.stringify(name)}. Which one?`,
    options: matches.map((g) => ({ name: describe(g), value: g })),
  });
}

// Remembering which workspace a glue script file was deployed to

/**
 * Returns the key of a file's remembered workspace. Includes the glue's name,
 * because one file can be deployed as several glues with `--name`, each in its
 * own workspace.
 */
function fileWorkspaceKey(absPath: string, glueName: string) {
  return ["glue-file-workspace", GLUE_API_SERVER, absPath, glueName];
}

/**
 * Returns the KV key that's used to store the last deployed path for a glue, so
 * we can warn the user if they deploy a different file over the same glue,
 * which might be a mistake.
 */
export function lastDeployedPathKey(glueId: string) {
  return ["glue-last-deployed-path", GLUE_API_SERVER, glueId];
}

export async function rememberFileWorkspace(
  absPath: string,
  glueName: string,
  workspaceId: string,
) {
  await kv.set(fileWorkspaceKey(absPath, glueName), workspaceId);
}

/**
 * Picks the workspace to deploy (or dev) a glue script file into:
 *
 * 1. the one passed with `--workspace`;
 * 2. the one remembered on this machine for this file and glue name, from an
 *    earlier deploy, dev or migrate;
 * 3. the user's only workspace;
 * 4. otherwise the user is asked.
 */
export async function pickWorkspaceForFile(
  options: WorkspaceOptions,
  absPath: string,
  glueName: string,
  environment: GlueEnvironment,
): Promise<WorkspaceRef> {
  const purpose = environment === "dev" ? "run this glue in" : "deploy to";
  if (options.workspace) {
    return await pickWorkspace(options, { purpose });
  }
  const workspaces = await getMyWorkspaces();

  const remembered = await kv.get<string>(fileWorkspaceKey(absPath, glueName));
  const rememberedWorkspace = workspaces.find((w) => w.id === remembered.value);
  if (rememberedWorkspace) {
    return rememberedWorkspace;
  }

  return await pickWorkspace(options, { purpose });
}

/**
 * After a glue moves to another workspace, sets the remembered workspace for
 * the script file it was last deployed from and its name after the move, so
 * later deploys of that file under that name go to the new workspace.
 *
 * Does nothing if the workspace remembered for the file and the glue's old
 * name isn't the one the glue moved from, because the file has since been
 * deployed elsewhere as a different glue.
 *
 * @param glue the glue as it was before the move
 * @param newName the glue's new name, if the move renamed it
 */
export async function updateFileWorkspaceAfterMove(
  glue: GlueDTO,
  toWorkspaceId: string,
  newName?: string,
) {
  const lastPath = await kv.get<string>(lastDeployedPathKey(glue.id));
  if (!lastPath.value) {
    return;
  }
  const remembered = await kv.get<string>(fileWorkspaceKey(lastPath.value, glue.name));
  if (remembered.value === null || remembered.value === glue.workspaceId) {
    await rememberFileWorkspace(lastPath.value, newName ?? glue.name, toWorkspaceId);
  }
}
