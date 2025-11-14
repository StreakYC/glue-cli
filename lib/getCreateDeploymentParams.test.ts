import { assertSnapshot } from "@std/testing/snapshot";
import { assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path/join";
import { getCreateDeploymentParams } from "./getCreateDeploymentParams.ts";

Deno.test("gives expected output", async (t) => {
  const params = await getCreateDeploymentParams(join(import.meta.dirname!, "../tests/resources/getCreateDeploymentParams/main/myGlueScript.ts"));
  assertEquals(params.deploymentContent!.entryPointUrl, "myGlueScript.ts");
  assertNotEquals(params.deploymentContent!.assets["myGlueScript.ts"], undefined);
  assertNotEquals(params.deploymentContent!.assets["deno.json"], undefined);
  assertNotEquals(params.deploymentContent!.assets["deno.lock"], undefined);
  assertEquals(params.deploymentContent!.assets["unimported-1.ts"], undefined);
  assertEquals(params.deploymentContent!.envVars?.BEST_ENV_VAR, "best_value");
  await assertSnapshot(t, params);
});

Deno.test("finds up-dir deno.json", async (t) => {
  const params = await getCreateDeploymentParams(
    join(import.meta.dirname!, "../tests/resources/getCreateDeploymentParams/up-dir-deno.json/content/myGlueScript.ts"),
  );
  assertEquals(params.deploymentContent?.entryPointUrl, "content/myGlueScript.ts");
  assertNotEquals(params.deploymentContent!.assets["deno.json"], undefined);
  assertNotEquals(params.deploymentContent!.assets["deno.lock"], undefined);
  assertEquals(params.deploymentContent!.envVars?.BEST_ENV_VAR, "best_value");
  await assertSnapshot(t, params);
});

Deno.test("allows up-dir imports", async (t) => {
  const params = await getCreateDeploymentParams(
    join(import.meta.dirname!, "../tests/resources/getCreateDeploymentParams/up-dir-imports/content-1/content-2/myGlueScript.ts"),
  );
  assertEquals(params.deploymentContent?.entryPointUrl, "content-1/content-2/myGlueScript.ts");
  assertNotEquals(params.deploymentContent!.assets["content-1/content-2/deno.json"], undefined);
  assertNotEquals(params.deploymentContent!.assets["content-1/content-2/deno.lock"], undefined);
  assertEquals(params.deploymentContent!.envVars?.BEST_ENV_VAR, "best_value");
  await assertSnapshot(t, params);
});
