import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { findDenoConfigPaths } from "./denoConfig.ts";
import {
  extractStreakRuntimeVersionFromDenoLockText,
  getOutdatedStreakRuntimeVersion,
} from "./runtimeVersionCheck.ts";

async function createTempDir(): Promise<{ path: string } & AsyncDisposable> {
  const tempDir = await Deno.makeTempDir({ prefix: "runtime-version-check-" });
  return {
    path: tempDir,
    async [Symbol.asyncDispose]() {
      await Deno.remove(tempDir, { recursive: true });
    },
  };
}

Deno.test("findDenoConfigPaths finds deno.json and deno.lock above the entrypoint", async () => {
  await using tempDir = await createTempDir();
  const projectDir = join(tempDir.path, "project");
  const nestedDir = join(projectDir, "src", "workers");
  await Deno.mkdir(nestedDir, { recursive: true });

  const denoJsonPath = join(projectDir, "deno.json");
  const denoLockPath = join(projectDir, "deno.lock");
  await Deno.writeTextFile(denoJsonPath, "{}\n");
  await Deno.writeTextFile(denoLockPath, "{}\n");

  assertEquals(await findDenoConfigPaths(nestedDir), { denoJsonPath, denoLockPath });
});

Deno.test("extractStreakRuntimeVersionFromDenoLockText prefers the resolved lock version", () => {
  const text = JSON.stringify({
    version: "5",
    specifiers: {
      "jsr:@std/path@^1.1.4": "1.1.4",
      "jsr:@streak-glue/runtime@~0.2.23": "0.2.31",
    },
  });
  assertEquals(extractStreakRuntimeVersionFromDenoLockText(text), "0.2.31");
});

Deno.test("getOutdatedStreakRuntimeVersion returns latest mismatch and formats warning", async () => {
  await using tempDir = await createTempDir();
  const projectDir = join(tempDir.path, "project");
  const sourceDir = join(projectDir, "src");
  await Deno.mkdir(sourceDir, { recursive: true });

  const filename = join(sourceDir, "myGlue.ts");
  await Deno.writeTextFile(filename, "console.log('hello');\n");
  await Deno.writeTextFile(
    join(projectDir, "deno.json"),
    JSON.stringify({
      imports: {
        "@streak-glue/runtime": "jsr:@streak-glue/runtime@~0.2.22",
      },
    }),
  );
  await Deno.writeTextFile(
    join(projectDir, "deno.lock"),
    JSON.stringify({
      version: "5",
      specifiers: {
        "jsr:@streak-glue/runtime@~0.2.22": "0.2.23",
      },
    }),
  );
  const outdatedInfo = await getOutdatedStreakRuntimeVersion(
    filename,
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ scope: "@streak-glue", name: "runtime", latest: "0.2.33" }), {
          status: 200,
        }),
      ),
  );
  assertEquals(outdatedInfo, {
    currentVersion: "0.2.23",
    latestVersion: "0.2.33",
  });
});
