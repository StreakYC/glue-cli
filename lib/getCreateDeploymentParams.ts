import { load as dotenvLoad } from "@std/dotenv";
import { walk } from "@std/fs/walk";
import { exists } from "@std/fs/exists";
import * as path from "@std/path";
import type { CreateDeploymentParams, DeploymentAsset, Runner } from "../backend.ts";

export async function getCreateDeploymentParams(file: string, runner: Runner = "deno"): Promise<CreateDeploymentParams> {
  // For now, we're just uploading all .js/.ts files in the same directory as
  // the entry point. TODO follow imports and only upload necessary files.

  const fileDir = path.dirname(file);
  const entryPointUrl = path.relative(fileDir, file);

  const envVars = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  /** Contains filenames relative to fileDir. */
  const filesToUpload = new Set<string>([entryPointUrl]);

  const uploadIfExists = ["deno.json", "deno.jsonc", "deno.lock"];
  for (const file of uploadIfExists) {
    if (await exists(path.join(fileDir, file))) {
      filesToUpload.add(file);
    }
  }

  for await (
    const dirEntry of walk(fileDir, {
      exts: ["ts", "js"],
      includeDirs: false,
    })
  ) {
    let relativePath = path.relative(fileDir, dirEntry.path);
    if (globalThis.Deno?.build?.os === "windows") {
      relativePath = relativePath.replaceAll("\\", "/");
    }
    filesToUpload.add(relativePath);
  }

  return {
    deploymentContent: {
      entryPointUrl,
      assets: Object.fromEntries(
        await Promise.all(
          filesToUpload.values()
            .map(async (file): Promise<[string, DeploymentAsset]> => [
              file,
              { kind: "file", content: await Deno.readTextFile(path.join(fileDir, file)) },
            ]),
        ),
      ),
      envVars,
    },
    runner,
  };
}
