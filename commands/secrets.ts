import { Confirm } from "@cliffy/prompt/confirm";
import { Table } from "@cliffy/table";
import { bold, dim, green } from "@std/fmt/colors";
import { deleteSecret, getSecrets, setSecret as setBackendSecret, stopGlue } from "../backend.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { formatEpochMillis, runStep } from "../ui/utils.ts";
import {
  describeWorkspace,
  getMyWorkspaces,
  pickWorkspace,
  referencedWorkspaces,
  type WorkspaceOptions,
} from "../lib/workspaces.ts";

interface ListSecretsOptions extends WorkspaceOptions {
  json?: boolean;
}

export async function setSecret(options: WorkspaceOptions, key: string, value: string) {
  await checkForAuthCredsOtherwiseExit();
  const workspace = await pickWorkspace(options, { purpose: "set the secret in" });
  await runStep(
    `Setting ${key} secret in ${describeWorkspace(workspace)}...`,
    () => setBackendSecret(key, value, workspace.id),
  );
}

export async function listSecrets(options: ListSecretsOptions) {
  await checkForAuthCredsOtherwiseExit();

  const load = () => Promise.all([getSecrets(options.workspace), getMyWorkspaces()]);

  if (options.json) {
    const [secrets, workspaces] = await load();
    console.log(JSON.stringify(
      {
        secrets,
        workspaces: referencedWorkspaces(secrets.map((s) => s.workspaceId), workspaces),
      },
      null,
      2,
    ));
    return;
  }

  const [secrets, workspaces] = await runStep("Loading secrets...", load);
  if (secrets.length === 0) {
    console.log("No secrets found");
    return;
  }

  // Only show workspaces when the secrets span more than one.
  const showWorkspace = new Set(secrets.map((s) => s.workspaceId)).size > 1;
  new Table()
    .header(["Name", ...(showWorkspace ? ["Workspace"] : []), "Created At", "Updated At"])
    .body(
      secrets.map((secret) => [
        bold(secret.name),
        ...(showWorkspace
          ? [workspaces.find((w) => w.id === secret.workspaceId)?.name ?? secret.workspaceId]
          : []),
        dim(formatEpochMillis(secret.createdAt)),
        dim(formatEpochMillis(secret.updatedAt)),
      ]),
    )
    .padding(4)
    .render();
}

export async function deleteSecretCmd(options: WorkspaceOptions, key: string) {
  await checkForAuthCredsOtherwiseExit();

  // Only workspaces that have a secret with this name are candidates.
  const secrets = await runStep("Loading secrets...", () => getSecrets(options.workspace));
  const workspaceIdsWithSecret = new Set(
    secrets.filter((s) => s.name === key).map((s) => s.workspaceId),
  );
  const workspace = await pickWorkspace(options, {
    purpose: "delete the secret from",
    filter: (w) => workspaceIdsWithSecret.has(w.id),
    ineligibleReason: `doesn't have a secret named ${key}`,
    noneEligibleMessage: `No secret named ${key} found.`,
  });

  const confirm = await Confirm.prompt({
    message: `Are you sure you want to delete the ${key} secret from ${
      describeWorkspace(workspace)
    }?`,
    default: false,
  });
  if (!confirm) {
    return;
  }

  let result = await runStep(
    `Deleting ${key} secret...`,
    () => deleteSecret(key, workspace.id),
  );
  if (result.success) {
    return;
  }

  console.log("This secret is being used by the following glues that need to be stopped first:");
  const glueNames = result.gluesNeedingStopping.map((glue) => `${green(glue.name)} (${glue.id})`)
    .join(",");
  console.log(glueNames);

  const stopConfirm = await Confirm.prompt({
    message: "Stop these glues?",
    default: false,
  });
  if (!stopConfirm) {
    return;
  }

  for (const glue of result.gluesNeedingStopping) {
    await runStep(`Stopping glue ${glue.name} (${glue.id})...`, async () => {
      await stopGlue(glue.id);
    });
  }
  console.log(`\n`);

  result = await runStep(`Deleting ${key} secret...`, () => deleteSecret(key, workspace.id));
  if (!result.success) {
    throw new Error(result.error ?? `Failed to delete ${key} secret`);
  }
}
