import { defineEval } from "eve/evals";

export default defineEval({
  description: "Atlas answers a simple greeting without using tools.",
  async test(t) {
    await t.send("Hello Atlas.");
    t.completed();
    t.usedNoTools();
  },
});
