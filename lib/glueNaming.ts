import { basename } from "@std/path";
import { TextLineStream } from "@std/streams/text-line-stream";

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
  using f = await Deno.open(filePath);
  const readable = f.readable
    .pipeThrough(new TextDecoderStream()) // decode Uint8Array to string
    .pipeThrough(new TextLineStream()); // split string line by line

  for await (const line of readable) {
    const match = line.match(/^\s*\/\/\s*glue-name\s+(\S+)\s*$/);
    if (match) {
      return match[1].trim();
    }
  }

  // 3. Fallback to filename
  return basename(filePath);
}
