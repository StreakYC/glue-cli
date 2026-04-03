import { exists } from "@std/fs/exists";
import * as path from "@std/path";

export interface DenoConfigPaths {
  denoJsonPath?: string;
  denoLockPath?: string;
}

export async function findDenoConfigPaths(startDir: string): Promise<DenoConfigPaths> {
  const denoJsonPath = await findFileInDirectoryOrAbove(startDir, ["deno.json", "deno.jsonc"]);
  if (!denoJsonPath) {
    return {};
  }

  const denoLockPath = path.join(path.dirname(denoJsonPath), "deno.lock");
  return {
    denoJsonPath,
    denoLockPath: await exists(denoLockPath) ? denoLockPath : undefined,
  };
}

/** Generator that yields a directory and its parent directories */
export function* parentDirectories(startDir: string): Generator<string> {
  let currentDir = path.resolve(startDir);
  while (true) {
    yield currentDir;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
}

/** Find any of the `searchNames` files in fileDir or its parent directories */
export async function findFileInDirectoryOrAbove(
  fileDir: string,
  searchNames: string[],
): Promise<string | undefined> {
  try {
    for (const currentDir of parentDirectories(fileDir)) {
      for (const searchName of searchNames) {
        const currentPath = path.join(currentDir, searchName);
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
