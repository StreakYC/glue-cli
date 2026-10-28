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
import { chooseWorkspace, describeWorkspace, isSamePath } from "./workspaceChoice.ts";

export {
  chooseWorkspace,
  describeWorkspace,
  isSamePath,
  referencedWorkspaces,
  workspaceNameForGlue,
} from "./workspaceChoice.ts";

/** The global `--workspace` option, as parsed by Cliffy. */
export interface WorkspaceOptions {
  workspace?: string[];
}

export const WORKSPACE_ID_REGEX = /^w_[0-9a-f]+$/;

let workspacesPromise: Promise<WorkspaceDTO[]> | undefined;

/** The user's workspaces, loaded once per process. */
export function getMyWorkspaces(): Promise<WorkspaceDTO[]> {
  workspacesPromise ??= getWorkspaces();
  return workspacesPromise;
}

/**
 * Picks the single workspace a command acts on (see {@link chooseWorkspace}),
 * prompting in a terminal when it's ambiguous.
 */
export async function pickWorkspace(
  options: WorkspaceOptions,
  config: {
    /** e.g. "deploy to" or "invite to" */
    purpose: string;
    /** limits which workspaces can be picked */
    filter?: (workspace: WorkspaceDTO) => boolean;
    /** explains why a workspace passed with `--workspace` can't be picked */
    ineligibleReason?: string;
    /** the error when no workspace can be picked */
    noneEligibleMessage?: string;
  },
): Promise<WorkspaceDTO> {
  const all = await getMyWorkspaces();
  const eligible = config.filter ? all.filter(config.filter) : all;
  const choice = chooseWorkspace(
    options.workspace,
    eligible,
    all,
    config.ineligibleReason,
    config.noneEligibleMessage,
  );
  switch (choice.kind) {
    case "chosen":
      return choice.workspace;
    case "error":
      throw new UserFacingError(choice.message);
    case "ask":
      return await askForWorkspace(
        choice.options,
        `Which workspace do you want to ${config.purpose}?`,
      );
  }
}

async function askForWorkspace(options: WorkspaceDTO[], message: string): Promise<WorkspaceDTO> {
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
 * Finds the glue with a name, in the `--workspace` workspaces or all of the
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
  const [matches, workspaces] = await runStep(
    `Loading glue ${name}...`,
    () => Promise.all([getGluesByName(name, environment, options.workspace), getMyWorkspaces()]),
    true,
    config.quiet,
  );
  if (matches.length <= 1) {
    return matches[0];
  }
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

function fileWorkspaceKey(absPath: string) {
  return ["glue-file-workspace", GLUE_API_SERVER, absPath];
}

export function lastDeployedPathKey(glueId: string) {
  return ["glue-last-deployed-path", GLUE_API_SERVER, glueId];
}

export async function rememberFileWorkspace(absPath: string, workspaceId: string) {
  await kv.set(fileWorkspaceKey(absPath), workspaceId);
}

/**
 * Picks the workspace to deploy (or dev) a glue script file into:
 *
 * 1. the one passed with `--workspace`;
 * 2. the one this file was last deployed to from this machine;
 * 3. the workspace of an existing glue with this name that was last deployed
 *    from this file (dev glues are private, so any existing dev glue counts),
 *    which covers files deployed before workspaces existed;
 * 4. the user's only workspace;
 * 5. otherwise the user is asked.
 */
export async function pickWorkspaceForFile(
  options: WorkspaceOptions,
  absPath: string,
  glueName: string,
  environment: GlueEnvironment,
): Promise<WorkspaceDTO> {
  const purpose = environment === "dev" ? "run this glue in" : "deploy to";
  if (options.workspace) {
    return await pickWorkspace(options, { purpose });
  }
  const workspaces = await getMyWorkspaces();

  const remembered = await kv.get<string>(fileWorkspaceKey(absPath));
  const rememberedWorkspace = workspaces.find((w) => w.id === remembered.value);
  if (rememberedWorkspace) {
    return rememberedWorkspace;
  }

  const existing = await getGluesByName(glueName, environment);
  const fromThisFile: GlueDTO[] = [];
  for (const glue of existing) {
    if (environment === "dev") {
      fromThisFile.push(glue);
      continue;
    }
    const lastPath = await kv.get<string>(lastDeployedPathKey(glue.id));
    if (lastPath.value && isSamePath(lastPath.value, absPath)) {
      fromThisFile.push(glue);
    }
  }
  if (fromThisFile.length === 1) {
    const workspace = workspaces.find((w) => w.id === fromThisFile[0].workspaceId);
    if (workspace) {
      return workspace;
    }
  }

  return await pickWorkspace(options, { purpose });
}

/**
 * After a glue moves to another workspace, points the script file it was last
 * deployed from at the new workspace so later deploys go there too.
 */
export async function updateFileWorkspaceAfterMove(glueId: string, workspaceId: string) {
  const lastPath = await kv.get<string>(lastDeployedPathKey(glueId));
  if (lastPath.value) {
    await rememberFileWorkspace(lastPath.value, workspaceId);
  }
}
