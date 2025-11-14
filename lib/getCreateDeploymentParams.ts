import { load as dotenvLoad } from "@std/dotenv";
import { exists } from "@std/fs/exists";
import * as path from "@std/path";
import { join as posixPathJoin } from "@std/path/posix/join";
import type { CreateDeploymentParams, DeploymentAsset, Runner } from "../backend.ts";
import { parseImports } from "./parseImports.ts";

/**
 * This function takes a path to a JS/TS file and returns a
 * {@link CreateDeploymentParams} object with that file as the entry point and
 * includes all of its dependencies.
 *
 * It also looks for a deno.json or deno.jsonc file in the same directory or any
 * parent directory and includes it and its lockfile if found.
 *
 * It also looks for a .env file in the same directory as the entry point and
 * includes its variables.
 */
export async function getCreateDeploymentParams(file: string, runner: Runner = "deno"): Promise<CreateDeploymentParams> {
  const fileDir = path.dirname(file);
  let entryPointUrl = path.relative(fileDir, file);

  const envVars = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  let assets = new Map<string, Promise<DeploymentAsset>>();

  function addAsset(relativePath: string, isCode: boolean): Promise<void> {
    if (globalThis.Deno?.build?.os === "windows") {
      // We want the keys of `assets` to be consistent across platforms
      relativePath = relativePath.replaceAll("\\", "/");
    }

    if (assets.has(relativePath)) {
      return Promise.resolve();
    }

    const realPath = path.join(fileDir, relativePath);
    const contentPromise = Deno.readTextFile(realPath);

    const allImportsAddedPromise = (async () => {
      if (isCode) {
        const content = await contentPromise;

        const imports = parseImports(content, realPath);
        await Promise.all(
          imports.map(async (imp) => {
            // We're only handling local files
            if (!imp.moduleName.startsWith(".")) {
              return;
            }
            // relative to the `fileDir` assets root
            const relativeImportPath = path.join(path.dirname(relativePath), imp.moduleName);
            if (imp.type == undefined) {
              await addAsset(relativeImportPath, true);
            } else if (imp.type === "json") {
              await addAsset(relativeImportPath, false);
            } else {
              console.warn(`Unknown import type ${JSON.stringify(imp.type)} for ${JSON.stringify(imp.moduleName)}`);
              await addAsset(relativeImportPath, false);
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

  // Find deno.json if present
  const denoJsonPath = await findDenoJson(fileDir);
  if (denoJsonPath) {
    await addAsset(path.relative(fileDir, denoJsonPath), false);

    const denoLockPath = path.join(path.dirname(denoJsonPath), "deno.lock");
    if (await exists(denoLockPath)) {
      await addAsset(path.relative(fileDir, denoLockPath), false);
    }
  }

  await entryPointPromise;

  // after all assets have been added, normalize asset names so none start with "../"
  const upDirCount = assets.keys()
    .map(countUpDirs)
    .reduce((a, b) => Math.max(a, b), 0);
  if (upDirCount > 0) {
    const absoluteFileDir = path.resolve(fileDir);
    const absoluteFileDirParts = absoluteFileDir.split(path.SEPARATOR_PATTERN).filter(Boolean);
    while (absoluteFileDirParts.length < upDirCount) {
      absoluteFileDirParts.unshift("unknown");
    }
    const upDirs = absoluteFileDirParts.slice(-upDirCount);

    entryPointUrl = posixPathJoin(...upDirs, entryPointUrl);
    assets = new Map(
      assets.entries().map(([relativePath, contentPromise]) => [
        posixPathJoin(...upDirs, relativePath),
        contentPromise,
      ]),
    );
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

/** Generator that yields a directory and its parent directories */
function* parentDirectories(startDir: string): Generator<string> {
  let currentDir = startDir;
  while (true) {
    yield currentDir;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
}

/** Find deno.json or deno.jsonc in fileDir or its parent directories */
async function findDenoJson(fileDir: string): Promise<string | undefined> {
  const denoJsonNames = ["deno.json", "deno.jsonc"];
  try {
    for (const currentDir of parentDirectories(fileDir)) {
      for (const denoJsonName of denoJsonNames) {
        const currentPath = path.join(currentDir, denoJsonName);
        if (await exists(currentPath)) {
          return currentPath;
        }
      }
    }
  } catch (err) {
    if (globalThis.Deno?.errors?.NotCapable && err instanceof Deno.errors.NotCapable) {
      // If we only have permissions to a specific directory, then we may hit
      // this error when trying to access parent directories. Assume we're not
      // meant to access them and stop searching.
    } else {
      throw err;
    }
  }
}

/**
 * Count how many "../" are at the start of the path.
 *
 * Assumes that the path is normalized and does not contain any of:
 * - duplicate "/"
 * - "./"
 * - "../" after regular path segments
 */
function countUpDirs(p: string): number {
  let count = 0;
  while (p.startsWith("../", count * 3)) {
    count++;
  }
  return count;
}
