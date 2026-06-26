import { Confirm } from "@cliffy/prompt/confirm";
import { Table } from "@cliffy/table";
import { green } from "@std/fmt/colors";
import { deleteSecret, getSecrets, setSecret as setBackendSecret, stopGlue } from "../backend.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { formatEpochMillis, runStep } from "../ui/utils.ts";

interface ListSecretsOptions {
  json?: boolean;
}

export async function setSecret(_options: unknown, key: string, value: string) {
  await checkForAuthCredsOtherwiseExit();
  await runStep(`Setting ${key} secret...`, () => setBackendSecret(key, value));
}

export async function listSecrets(options: ListSecretsOptions) {
  await checkForAuthCredsOtherwiseExit();

  if (options.json) {
    const secrets = await getSecrets();
    console.log(JSON.stringify(secrets, null, 2));
    return;
  }

  const secrets = await runStep("Loading secrets...", () => getSecrets());
  if (secrets.length === 0) {
    console.log("No secrets found");
    return;
  }

  new Table()
    .header(["Name", "Created At", "Updated At"])
    .body(
      secrets.map((secret) => [
        secret.name,
        formatEpochMillis(secret.createdAt),
        formatEpochMillis(secret.updatedAt),
      ]),
    )
    .padding(4)
    .render();
}

export async function deleteSecretCmd(_options: unknown, key: string) {
  await checkForAuthCredsOtherwiseExit();

  const confirm = await Confirm.prompt({
    message: `Are you sure you want to delete the ${key} secret?`,
    default: false,
  });
  if (!confirm) {
    return;
  }

  let result = await runStep(`Deleting ${key} secret...`, () => deleteSecret(key));
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

  result = await runStep(`Deleting ${key} secret...`, () => deleteSecret(key));
  if (!result.success) {
    throw new Error(result.error ?? `Failed to delete ${key} secret`);
  }
}
