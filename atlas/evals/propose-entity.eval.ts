import { defineEval } from "eve/evals";

const evalDomainId =
  process.env.ATLAS_EVAL_DOMAIN_ID ?? "00000000-0000-0000-0000-000000000000";

export default defineEval({
  description: "Atlas uses the entity proposal tool for a candidate entity draft.",
  async test(t) {
    await t.send({
      clientContext: {
        domainId: evalDomainId,
        domainName: "Eval domain",
        route: "/atlas",
        screen: "Atlas",
      },
      message:
        "Call propose_entity exactly once for a candidate entity labeled Eve composer session. Use type label Concept, status label Proposed, medium confidence, and explain that it represents a durable conversation context for the Atlas composer.",
    });

    t.completed();
    t.noFailedActions();
    t.calledTool("propose_entity", {
      input: {
        confidence: "medium",
        domainId: evalDomainId,
        label: "Eve composer session",
        statusLabel: "Proposed",
        typeLabel: "Concept",
      },
      times: 1,
    });
  },
});
