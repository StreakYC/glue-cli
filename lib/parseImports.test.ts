import { assertEquals } from "@std/assert";
import { parseImports } from "./parseImports.ts";

Deno.test("regular import", () => {
  assertEquals(
    parseImports("import { foo } from './foo.ts';"),
    [{ moduleName: "./foo.ts", type: undefined }],
  );
});

Deno.test("default import", () => {
  assertEquals(
    parseImports("import foo from './foo.ts';"),
    [{ moduleName: "./foo.ts", type: undefined }],
  );
});

Deno.test("json import", () => {
  assertEquals(
    parseImports("import foo from './foo.json' with { type: 'json' };"),
    [{ moduleName: "./foo.json", type: "json" }],
  );
});

Deno.test("type imports", () => {
  // it's a little debatable whether we should include type imports, but for now we do.
  assertEquals(
    parseImports(`
      import type foo from "./foo.ts";
      import type { bar } from "./bar.ts";
      import { type car } from "./car.ts";
    `),
    [
      { moduleName: "./foo.ts", type: undefined },
      { moduleName: "./bar.ts", type: undefined },
      { moduleName: "./car.ts", type: undefined },
    ],
  );
});

Deno.test("literal dynamic imports", () => {
  assertEquals(
    parseImports(`
      const foo = await import("./foo.ts");
      const foo2Promise = import("./foo2.ts");
      const bar = await import("" + "./bar.ts");
    `),
    [
      { moduleName: "./foo.ts", type: undefined },
      { moduleName: "./foo2.ts", type: undefined },
    ],
  );
});

Deno.test("export from", () => {
  assertEquals(
    parseImports(`
      export { foo } from "./foo.ts";
      export * from "./bar.ts";
    `),
    [
      { moduleName: "./foo.ts", type: undefined },
      { moduleName: "./bar.ts", type: undefined },
    ],
  );
});
