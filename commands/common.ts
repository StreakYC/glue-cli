import { type AccountDTO, getAccounts, getGlues, type GlueDTO } from "../backend.ts";
import { Checkbox } from "@cliffy/prompt/checkbox";
import { Select } from "@cliffy/prompt/select";
import { runStep } from "../ui/utils.ts";
import { prettyLabels } from "../lib/prettyLabels.ts";
import { getMyWorkspaces, workspaceNameForGlue, type WorkspaceOptions } from "../lib/workspaces.ts";

export interface CommonCommandOptions extends WorkspaceOptions {
  verbose: boolean;
}

async function loadGlueOptions(options: WorkspaceOptions) {
  const [glues, workspaces] = await runStep(
    "Loading glues...",
    () =>
      Promise.all([
        getGlues({
          environment: "deploy",
          excludeTags: ["archived"],
          workspaceIds: options.workspace,
        }),
        getMyWorkspaces(),
      ]),
  );
  // Only show workspaces when the glues span more than one.
  const showWorkspace = new Set(glues.map((g) => g.workspaceId)).size > 1;
  return glues.map((glue) => ({
    name: showWorkspace ? `${glue.name} (${workspaceNameForGlue(glue, workspaces)})` : glue.name,
    value: glue,
  }));
}

export async function askUserForGlue(options: WorkspaceOptions): Promise<GlueDTO | undefined> {
  const glueOptions = await loadGlueOptions(options);
  if (!glueOptions.length) {
    return undefined;
  }
  return await Select.prompt({
    message: "Choose a glue",
    search: true,
    options: glueOptions,
  });
}

export async function askUserForGlues(options: WorkspaceOptions): Promise<GlueDTO[]> {
  const glueOptions = await loadGlueOptions(options);
  if (!glueOptions.length) {
    return [];
  }
  return await Checkbox.prompt({
    message: "Choose one or more glues",
    options: glueOptions,
  });
}

export async function askUserForAccount(message: string): Promise<AccountDTO | undefined> {
  const accounts = await runStep("Loading accounts...", () => getAccounts());
  if (!accounts || accounts.length === 0) {
    return undefined;
  }
  return await Select.prompt({
    message,
    search: true,
    options: accounts.map((account) => ({
      name: account.type + " " + displayNameForAccount(account),
      value: account,
    })),
  });
}

export function displayNameForAccount(account: AccountDTO) {
  let retVal = `{${prettyLabels(account.labels)}}`;
  if (account.redactedApiKey) {
    retVal += ` (${account.redactedApiKey})`;
  }
  return retVal;
}
