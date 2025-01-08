import { basename, dirname, relative } from "@std/path";
import { walk } from "@std/fs/walk";
import { GLUE_API_SERVER } from "../common.ts";

interface DeployOptions {
  name?: string;
}

export async function deploy(options: DeployOptions, file: string) {
  const glueName = options.name ?? basename(file);

  // For now, we're just uploading all .js/.ts files in the same directory as
  // the entry point. TODO follow imports and only upload necessary files.
  const fileDir = dirname(file);

  const entryFile = basename(file);

  const filesToUpload: string[] = [entryFile];
  for await (
    const dirEntry of walk(fileDir, {
      exts: ["ts", "js"],
      includeDirs: false,
    })
  ) {
    const relativePath = relative(fileDir, dirEntry.path);
    filesToUpload.push(relativePath);
  }

  const assets: Record<string, string> = Object.fromEntries(
    await Promise.all(filesToUpload
      .map(async (file) => [file, await Deno.readTextFile(file)])),
  );

  const body = {
    name: glueName,
    entryPointUrl: entryFile,
    assets,
  };
  const res = await fetch(`${GLUE_API_SERVER}/glues/deploy`, {
    // TODO auth headers
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(await res.text());
}
