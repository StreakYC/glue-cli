import { basename } from "@std/path";

/**
 * figures out the name of a glue given a file path the user has provided and any options the user has provided.
 * @param filePath the path to the user specified glue file
 * @param explicitName the name of the glue the user has provided
 * @returns the name of the glue
 */
export async function getGlueName(filePath: string, explicitName?: string): Promise<string> {
  // 1. Explicit name from CLI
  if (explicitName) {
    return explicitName;
  }

  // 2. Comment in file
  const fileContent = await Deno.readTextFile(filePath);
  const lines = fileContent.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*\/\/\s*glue-name:\s*(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }

  // 3. Fallback to filename
  return basename(filePath).replace(/\.[^.]+$/, "");
}

export async function assertFileExists(filePath: string) {
  const fileStat = await Deno.stat(filePath);
  if (!fileStat.isFile) {
    throw new Error(`File ${filePath} is not a file or doesn't exist`);
  }
}
