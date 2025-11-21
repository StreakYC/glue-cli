import { assertEquals } from "@std/assert";
import { getGlueName } from "./glueNaming.ts";
import { join } from "@std/path";

async function createTempDir(): Promise<{ path: string } & AsyncDisposable> {
  const tempDir = await Deno.makeTempDir({
    prefix: "glue-naming-test-",
  });
  return {
    path: tempDir,
    async [Symbol.asyncDispose]() {
      await Deno.remove(tempDir, { recursive: true });
    },
  };
}

Deno.test("getGlueName - explicit name", async () => {
  const name = await getGlueName("some/path/file.ts", "explicit-name");
  assertEquals(name, "explicit-name");
});

Deno.test("getGlueName - file comment", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "myGlue.ts");

  await Deno.writeTextFile(
    filePath,
    `
// glue-name comment-name
import something from "somewhere";

console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, "comment-name");
});

Deno.test("getGlueName - file comment with spaces", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "myGlueSpaces.ts");

  await Deno.writeTextFile(
    filePath,
    `
    //   glue-name   spaced-name  
    console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, "spaced-name");
});

Deno.test("getGlueName - fallback to filename", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "my-file-name.ts");
  await Deno.writeTextFile(filePath, "");
  const name = await getGlueName(filePath);
  assertEquals(name, "my-file-name.ts");
});

Deno.test("getGlueName - fallback to filename if comment missing", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "noComment.ts");

  await Deno.writeTextFile(
    filePath,
    `
    // regular comment
    console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, "noComment.ts");
});

Deno.test("getGlueName - fallback to filename with multiple extensions", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "my.glue.script.ts");
  await Deno.writeTextFile(filePath, "");
  const name = await getGlueName(filePath);
  assertEquals(name, "my.glue.script.ts");
});

Deno.test("getGlueName - fallback to filename with underscores", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "name_with_underscores.js");
  await Deno.writeTextFile(filePath, "");
  const name = await getGlueName(filePath);
  assertEquals(name, "name_with_underscores.js");
});

Deno.test("getGlueName - fallback to filename with dashes", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "name-with-dashes.tsx");
  await Deno.writeTextFile(filePath, "");
  const name = await getGlueName(filePath);
  assertEquals(name, "name-with-dashes.tsx");
});

Deno.test("getGlueName - file comment with extreme spacing", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "myGlueExtremeSpaces.ts");

  await Deno.writeTextFile(
    filePath,
    `
    //      glue-name      extremely-spaced      
    console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, "extremely-spaced");
});

Deno.test("getGlueName - file comment with no spaces", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "myGlueNoSpaces.ts");

  await Deno.writeTextFile(
    filePath,
    `
//glue-name compact
    console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, "compact");
});

Deno.test("getGlueName - file comment indented", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "myGlueIndented.ts");

  await Deno.writeTextFile(
    filePath,
    `
      // glue-name indented
    console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, "indented");
});

Deno.test("getGlueName - JSON string", async () => {
  await using tempDir = await createTempDir();
  const filePath = join(tempDir.path, "myGlueJsonName.ts");

  await Deno.writeTextFile(
    filePath,
    `
      // glue-name "foo \\" bar \u2603 \\u2603 "
    console.log("hello");
    `.trim(),
  );

  const name = await getGlueName(filePath);
  assertEquals(name, 'foo " bar \u2603 \u2603 ');
});
