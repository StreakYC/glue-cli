import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log(_event.bodyText);
});

glue.webhook.onGet((_event) => {
  console.log("webhook 2 triggered");
});
