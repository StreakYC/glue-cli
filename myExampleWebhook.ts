import { onWebhook } from "./runtime/webhook.ts";

onWebhook((event) => {
  console.log("hello world! event:", JSON.stringify(event));
});
