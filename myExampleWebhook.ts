import { onWebhook } from "./runtime/webhook.ts";

onWebhook((_event) => {
  console.log("Hello world, from example.ts 123");
});
