import { onWebhook } from "./runtime/glue.ts";

onWebhook((_) => {
  // console.log(`event details: ${JSON.stringify(event)}`);
  console.log("1");
  console.log("2");
});

onWebhook((_) => {
  // console.log(`event details: ${JSON.stringify(event)}`);
  console.log("3");
  console.log("4");
});

onWebhook((_) => {
  // console.log(`event details: ${JSON.stringify(event)}`);
  console.log("4");
  console.log("5");
});
