import { load as dotenvLoad } from "@std/dotenv";
import { exists } from "@std/fs/exists";
import * as path from "@std/path";
import type { CreateDeploymentParams, DeploymentAsset, Runner } from "../backend.ts";
import { parseImports } from "./parseImports.ts";

export async function getCreateDeploymentParams(file: string, runner: Runner = "deno"): Promise<CreateDeploymentParams> {
  const fileDir = path.dirname(file);
  const entryPointUrl = path.relative(fileDir, file);

  const envVars = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  const assets = new Map<string, Promise<DeploymentAsset>>();

  function addAsset(relativePath: string, isCode: boolean): Promise<void> {
    if (assets.has(relativePath)) {
      return Promise.resolve();
    }

    const contentPromise = Deno.readTextFile(path.join(fileDir, relativePath));

    const allImportsAddedPromise = (async () => {
      if (isCode) {
        const content = await contentPromise;

        const imports = parseImports(content, relativePath);
        await Promise.all(
          imports.map(async (imp) => {
            // We're only handling local files
            if (!imp.moduleName.startsWith(".")) {
              return;
            }
            if (imp.type == undefined) {
              await addAsset(path.join(path.dirname(relativePath), imp.moduleName), true);
            } else if (imp.type === "json") {
              await addAsset(path.join(path.dirname(relativePath), imp.moduleName), false);
            } else {
              console.warn(`Unknown import type ${JSON.stringify(imp.type)} for ${JSON.stringify(imp.moduleName)}`);
              await addAsset(path.join(path.dirname(relativePath), imp.moduleName), false);
            }
          }),
        );
      }
    })();

    assets.set(
      relativePath,
      (async () => {
        return { kind: "file", content: await contentPromise };
      })(),
    );

    return allImportsAddedPromise;
  }

  const entryPointPromise = addAsset(entryPointUrl, true);

  const uploadIfExists = ["deno.json", "deno.jsonc", "deno.lock"];
  await Promise.all(
    uploadIfExists.map(async (file) => {
      if (await exists(path.join(fileDir, file))) {
        await addAsset(file, false);
      }
    }),
  );

  await entryPointPromise;

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
