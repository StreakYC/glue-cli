import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log("webhook 1 triggered");
});

glue.webhook.onGet((_event) => {
  console.log("webhook 2 triggered");
});
