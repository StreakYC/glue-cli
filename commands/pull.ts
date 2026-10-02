import { Select } from "@cliffy/prompt/select";
import { decodeBase64 } from "@std/encoding/base64";
import { exists } from "@std/fs/exists";
import { SEPARATOR } from "@std/path/constants";
import { isAbsolute } from "@std/path/is-absolute";
import { join } from "@std/path/join";
import { relative } from "@std/path/relative";
import { resolve } from "@std/path/resolve";
import { dirname as posixDirname } from "@std/path/posix/dirname";
import * as mod from "@std/fmt/colors";
import {
  type DeploymentContent,
  type DeploymentDTO,
  getDeploymentById,
  getGlueById,
  getGlueByName,
  type GlueDTO,
  pullDeployment,
} from "../backend.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { isPrefixId } from "../common.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";

export const pull = async (_options: unknown, query?: string) => {
  await checkForAuthCredsOtherwiseExit();

  let glue: GlueDTO | undefined;
  let deploymentId: string;

  if (query && isPrefixId(query, "d")) {
    const deployment: DeploymentDTO | undefined = await runStep(
      "Loading deployment...",
      () => getDeploymentById(query),
    );
    if (!deployment) {
      throw new Error(`Deployment ${query} not found`);
    }
    glue = await runStep("Loading glue...", () => getGlueById(deployment.glueId));
    if (!glue) {
      throw new Error(`Glue ${deployment.glueId} not found`);
    }
    deploymentId = deployment.id;
  } else {
    if (query) {
      glue = await runStep(
        "Loading glue...",
        () => isPrefixId(query, "g") ? getGlueById(query) : getGlueByName(query, "deploy"),
      );
    } else if (Deno.stdout.isTerminal()) {
      glue = await askUserForGlue();
    } else {
      throw new Error("You must provide a glue name when not running in a terminal");
    }
    if (!glue) {
      throw new Error(query ? `Glue ${query} not found` : "No glue found");
    }
    if (!glue.currentDeployment) {
      throw new Error(
        `Glue ${glue.name} has no current deployment. Pass a deployment id to pull a specific deployment.`,
      );
    }
    deploymentId = glue.currentDeployment.id;
  }

  const deploymentContent = await runStep(
    `Downloading code for ${glue.name} (${deploymentId})...`,
    () => pullDeployment(deploymentId),
  );

  let baseDir = ".";
  let allowOverwrite = false;
  const collisions = await findCollidingPaths(baseDir, deploymentContent.assets);
  if (collisions.length) {
    console.log(`\nThe following files already exist and would be overwritten:`);
    for (const path of collisions) {
      console.log(`  - ${path}`);
    }
    console.log();

    if (!Deno.stdin.isTerminal()) {
      throw new Error("Refusing to overwrite existing files when not running in a terminal");
    }

    const newDir = `${glue.name}-${deploymentId}`;
    const choice = await Select.prompt<"overwrite" | "newDir" | "cancel">({
      message: "What do you want to do?",
      options: [
        { name: `Write the files into a new directory (${newDir})`, value: "newDir" },
        { name: "Overwrite the existing files", value: "overwrite" },
        { name: "Cancel", value: "cancel" },
      ],
    });
    if (choice === "cancel") {
      console.log("Cancelled");
      return;
    }
    if (choice === "overwrite") {
      allowOverwrite = true;
    } else if (choice === "newDir") {
      if (await exists(newDir)) {
        throw new Error(`Directory ${newDir} already exists`);
      }
      baseDir = newDir;
    }
  }

  await runStep(
    `Writing ${Object.keys(deploymentContent.assets).length} files...`,
    () => extractDeploymentContentAssets(baseDir, deploymentContent.assets, allowOverwrite),
  );

  console.log(`\nEntry point: ${mod.bold(join(baseDir, deploymentContent.entryPointUrl))}`);
};

async function findCollidingPaths(
  baseDir: string,
  assets: DeploymentContent["assets"],
): Promise<string[]> {
  const collisions: string[] = [];
  for (const path of Object.keys(assets)) {
    // check this up front too so we don't write some files before failing
    assertSafeAssetPath(baseDir, path);

    if (await exists(join(baseDir, path))) {
      collisions.push(path);
    }
  }
  return collisions;
}

async function extractDeploymentContentAssets(
  baseDir: string,
  assets: DeploymentContent["assets"],
  allowOverwrite = false,
) {
  for (const [path, asset] of Object.entries(assets)) {
    assertSafeAssetPath(baseDir, path);

    const dir = posixDirname(path);
    await Deno.mkdir(join(baseDir, dir), { recursive: true });

    const fullPath = join(baseDir, path);
    if (asset.encoding === "base64") {
      await Deno.writeFile(fullPath, decodeBase64(asset.content), { createNew: !allowOverwrite });
    } else {
      await Deno.writeTextFile(fullPath, asset.content, { createNew: !allowOverwrite });
    }
  }
}

const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)\s*(\..*)?$/i;

function assertSafeAssetPath(baseDir: string, path: string) {
  const fail = () => {
    throw new Error(`Invalid path in deployment asset: ${JSON.stringify(path)}`);
  };
  // a backslash, colon (drive letters, NTFS alternate data streams), or control char is never legit
  // deno-lint-ignore no-control-regex
  if (path === "" || path.startsWith("/") || /[\\:*?"<>|\x00-\x1f]/.test(path)) fail();
  for (const part of path.split("/")) {
    if (
      part === "" || part === "." || part === ".." ||
      /[. ]$/.test(part) || // Windows strips trailing dots/spaces; don't allow un-normalized paths
      WINDOWS_RESERVED_NAME.test(part) ||
      // don't allow writing git hooks/config. GIT~1 is the 8.3 short name of .git on Windows.
      /^\.git$/i.test(part) || /^git~\d+$/i.test(part)
    ) {
      fail();
    }
  }
  // defense in depth: test that the resolved path is still within the base directory
  const root = resolve(baseDir);
  const rel = relative(root, resolve(root, path));
  if (rel === ".." || rel.startsWith(`..${SEPARATOR}`) || isAbsolute(rel)) fail();
}
