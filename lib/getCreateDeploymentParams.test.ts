import { assertSnapshot } from "@std/testing/snapshot";
import { assertEquals } from "@std/assert";
import { join } from "@std/path/join";
import { getCreateDeploymentParams } from "./getCreateDeploymentParams.ts";

Deno.test("gives expected output", async (t) => {
  const params = await getCreateDeploymentParams(join(import.meta.dirname!, "../tests/resources/getCreateDeploymentParams/myGlueScript.ts"));
  assertEquals(params.deploymentContent?.entryPointUrl, "myGlueScript.ts");
  assertEquals(typeof params.deploymentContent?.assets["myGlueScript.ts"]?.content, "string");
  // assertEquals(params.deploymentContent!.assets["unimported-1.ts"], undefined);
  await assertSnapshot(t, params);
});
