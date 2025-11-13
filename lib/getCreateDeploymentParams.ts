import { load as dotenvLoad } from "@std/dotenv";
import { walk } from "@std/fs/walk";
import { exists } from "@std/fs/exists";
import * as path from "@std/path";
import type { CreateDeploymentParams, DeploymentAsset, Runner } from "../backend.ts";

export async function getCreateDeploymentParams(file: string, runner: Runner = "deno"): Promise<CreateDeploymentParams> {
  const fileDir = path.dirname(file);
  const entryPointUrl = path.relative(fileDir, file);

  const envVars = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  const assets = new Map<string, Promise<DeploymentAsset>>();
  function addFile(relativePath: string) {
    if (assets.has(relativePath)) {
      return;
    }
    assets.set(
      relativePath,
      (async () => {
        const content = await Deno.readTextFile(path.join(fileDir, relativePath));
        return { kind: "file", content };
      })(),
    );
  }

  addFile(entryPointUrl);

  const uploadIfExists = ["deno.json", "deno.jsonc", "deno.lock"];
  for (const file of uploadIfExists) {
    if (await exists(path.join(fileDir, file))) {
      addFile(file);
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
    addFile(relativePath);
  }

  const sortedAssets = Array.from(assets).sort((a, b) => defaultCompareFn(a[0], b[0]));

  return {
    deploymentContent: {
      entryPointUrl,
      assets: Object.fromEntries(
        await Promise.all(
          sortedAssets
            .map(async ([file, contentsPromise]): Promise<[string, DeploymentAsset]> => [file, await contentsPromise]),
        ),
      ),
      envVars,
    },
    runner,
  };
}

function defaultCompareFn(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
