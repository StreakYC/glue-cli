import { assertEquals } from "@std/assert";
import { getGlueName } from "../lib/glueNaming.ts";
import { join } from "@std/path";

Deno.test("getGlueName - explicit name", async () => {
  const name = await getGlueName("some/path/file.ts", "explicit-name");
  assertEquals(name, "explicit-name");
});

Deno.test("getGlueName - file comment", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "myGlue.ts");

  try {
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
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - file comment with spaces", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "myGlueSpaces.ts");

  try {
    await Deno.writeTextFile(
      filePath,
      `
    //   glue-name   spaced-name  
    console.log("hello");
    `.trim(),
    );

    const name = await getGlueName(filePath);
    assertEquals(name, "spaced-name");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - fallback to filename", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "my-file-name.ts");
  await Deno.writeTextFile(filePath, "");
  try {
    const name = await getGlueName(filePath);
    assertEquals(name, "my-file-name");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - fallback to filename if comment missing", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "noComment.ts");

  try {
    await Deno.writeTextFile(
      filePath,
      `
    // regular comment
    console.log("hello");
    `.trim(),
    );

    const name = await getGlueName(filePath);
    assertEquals(name, "noComment");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - fallback to filename with multiple extensions", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "my.glue.script.ts");
  await Deno.writeTextFile(filePath, "");
  try {
    const name = await getGlueName(filePath);
    assertEquals(name, "my.glue.script");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - fallback to filename with underscores", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "name_with_underscores.js");
  await Deno.writeTextFile(filePath, "");
  try {
    const name = await getGlueName(filePath);
    assertEquals(name, "name_with_underscores");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - fallback to filename with dashes", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "name-with-dashes.tsx");
  await Deno.writeTextFile(filePath, "");
  try {
    const name = await getGlueName(filePath);
    assertEquals(name, "name-with-dashes");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - file comment with extreme spacing", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "myGlueExtremeSpaces.ts");

  try {
    await Deno.writeTextFile(
      filePath,
      `
    //      glue-name      extremely-spaced      
    console.log("hello");
    `.trim(),
    );

    const name = await getGlueName(filePath);
    assertEquals(name, "extremely-spaced");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - file comment with no spaces", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "myGlueNoSpaces.ts");

  try {
    await Deno.writeTextFile(
      filePath,
      `
//glue-name compact
    console.log("hello");
    `.trim(),
    );

    const name = await getGlueName(filePath);
    assertEquals(name, "compact");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getGlueName - file comment indented", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "myGlueIndented.ts");

  try {
    await Deno.writeTextFile(
      filePath,
      `
      // glue-name indented
    console.log("hello");
    `.trim(),
    );

    const name = await getGlueName(filePath);
    assertEquals(name, "indented");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
