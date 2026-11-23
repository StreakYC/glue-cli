import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { findDenoConfigPaths } from "./denoConfig.ts";
import { isBlockedByMinimumDependencyAge } from "./minimumDependencyAge.ts";
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
  const denoConfigPaths = await findDenoConfigPaths(sourceDir);
  const outdatedInfo = await getOutdatedStreakRuntimeVersion(
    filename,
    denoConfigPaths,
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
    latestBlockedByMinimumDependencyAge: false,
  });
});

async function checkBlocked(
  options: {
    denoJson?: unknown;
    projectNpmrc?: string;
    homeNpmrc?: string;
    denoVersion?: string;
    publishedHoursAgo: number;
  },
): Promise<boolean | undefined> {
  await using tempDir = await createTempDir();
  const projectDir = join(tempDir.path, "project");
  const homeDir = join(tempDir.path, "home");
  await Deno.mkdir(projectDir);
  await Deno.mkdir(homeDir);
  await Deno.writeTextFile(join(projectDir, "deno.json"), JSON.stringify(options.denoJson ?? {}));
  await Deno.writeTextFile(
    join(projectDir, "deno.lock"),
    JSON.stringify({ version: "5", specifiers: { "jsr:@streak-glue/runtime@~0.2.22": "0.2.23" } }),
  );
  if (options.projectNpmrc !== undefined) {
    await Deno.writeTextFile(join(projectDir, ".npmrc"), options.projectNpmrc);
  }
  if (options.homeNpmrc !== undefined) {
    await Deno.writeTextFile(join(homeDir, ".npmrc"), options.homeNpmrc);
  }
  const now = new Date("2026-11-17T12:00:00Z");
  const createdAt = new Date(now.getTime() - options.publishedHoursAgo * 60 * 60 * 1000)
    .toISOString();
  const outdatedInfo = await getOutdatedStreakRuntimeVersion(
    join(projectDir, "myGlue.ts"),
    await findDenoConfigPaths(projectDir),
    () =>
      Promise.resolve(Response.json({
        scope: "@streak-glue",
        name: "runtime",
        latest: "0.2.33",
        versions: { "0.2.33": { createdAt } },
      })),
    { now, homeDir },
  );
  return outdatedInfo?.latestBlockedByMinimumDependencyAge;
}

Deno.test("latest runtime version is blocked by the default minimum dependency age", async () => {
  assertEquals(await checkBlocked({ publishedHoursAgo: 2 }), true);
  assertEquals(await checkBlocked({ publishedHoursAgo: 25 }), false);
});

Deno.test("minimumDependencyAge in deno.json decides whether the latest runtime version is blocked", async () => {
  const blocked = (minimumDependencyAge: unknown, publishedHoursAgo: number) =>
    checkBlocked({ denoJson: { minimumDependencyAge }, publishedHoursAgo });
  assertEquals(await blocked(0, 2), false);
  assertEquals(await blocked("0", 2), false);
  assertEquals(await blocked(180, 2), true);
  assertEquals(await blocked(60, 2), false);
  assertEquals(await blocked("P3D", 48), true);
  assertEquals(await blocked("P3D", 73), false);
  assertEquals(await blocked("P1W", 100), true);
  assertEquals(await blocked("PT72H", 71), true);
  assertEquals(await blocked("P1DT12H", 30), true);
  assertEquals(await blocked("P1DT12H", 40), false);
  assertEquals(await blocked("2026-11-01", 2), true);
  assertEquals(await blocked("2026-11-17T11:00:00Z", 2), false);
  assertEquals(await blocked({ age: "P3D" }, 2), true);
  assertEquals(await blocked({ age: "P3D", exclude: ["npm:zod"] }, 2), true);
  assertEquals(await blocked({ age: "P3D", exclude: ["jsr:@streak-glue/runtime"] }, 2), false);
});

Deno.test(".npmrc min-release-age applies when deno.json has no minimumDependencyAge", async () => {
  assertEquals(
    await checkBlocked({ projectNpmrc: "min-release-age=3\n", publishedHoursAgo: 48 }),
    true,
  );
  assertEquals(
    await checkBlocked({ homeNpmrc: "min-release-age=3\n", publishedHoursAgo: 48 }),
    true,
  );
  assertEquals(
    await checkBlocked({
      projectNpmrc: "registry=https://example.com\nmin-release-age=0\n",
      homeNpmrc: "min-release-age=3\n",
      publishedHoursAgo: 2,
    }),
    false,
  );
  assertEquals(
    await checkBlocked({
      denoJson: { minimumDependencyAge: 0 },
      projectNpmrc: "min-release-age=3\n",
      publishedHoursAgo: 2,
    }),
    false,
  );
});

Deno.test("isBlockedByMinimumDependencyAge works without a deno.json", async () => {
  await using tempDir = await createTempDir();
  const now = new Date("2026-11-17T12:00:00Z");
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const blocked = (publishedAt: Date) =>
    isBlockedByMinimumDependencyAge("jsr:@streak-glue/runtime", publishedAt, undefined, {
      now,
      homeDir: tempDir.path,
    });

  assertEquals(await blocked(hoursAgo(2)), true);
  assertEquals(await blocked(hoursAgo(25)), false);

  await Deno.writeTextFile(join(tempDir.path, ".npmrc"), "min-release-age=3\n");
  assertEquals(await blocked(hoursAgo(48)), true);
});
