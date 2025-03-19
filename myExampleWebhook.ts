import { glue } from "@streak-glue/runtime";

glue.webhook.onWebhook((event) => {
  console.log(`event details: ${JSON.stringify(event)}`);
});

glue.webhook.onWebhook((_) => {
  // console.log(`event details: ${JSON.stringify(event)}`);
  console.log("3");
  console.log("4");
});

glue.webhook.onWebhook((_) => {
  // console.log(`event details: ${JSON.stringify(event)}`);
  console.log("4");
  console.log("5");
});
