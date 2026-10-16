import { defineEval } from "eve/evals";

const evalDomainId =
  process.env.ATLAS_EVAL_DOMAIN_ID ?? "00000000-0000-0000-0000-000000000000";

export default defineEval({
  description: "Atlas searches for duplicates before proposing a new entity.",
  async test(t) {
    await t.send({
      clientContext: {
        domainId: evalDomainId,
        domainName: "Eval domain",
        route: "/atlas",
        screen: "Atlas",
      },
      message:
        "Use the entity_proposal skill. Consider a candidate entity labeled Session-scoped Eve context. Search for duplicates first. If it appears new enough to review, call propose_entity with medium confidence.",
    });

    t.completed();
    t.noFailedActions();
    t.calledTool("search_entities", {
      input: {
        domainId: evalDomainId,
      },
    });
    t.calledTool("propose_entity", {
      input: {
        confidence: "medium",
        domainId: evalDomainId,
        label: "Session-scoped Eve context",
      },
    });
    t.toolOrder(["search_entities", "propose_entity"]);
  },
});
