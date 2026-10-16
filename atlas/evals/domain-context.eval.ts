import { defineEval } from "eve/evals";

const evalDomainId =
  process.env.ATLAS_EVAL_DOMAIN_ID ?? "00000000-0000-0000-0000-000000000000";

export default defineEval({
  description: "Atlas uses the active domain read tool before answering a domain context question.",
  async test(t) {
    await t.send({
      clientContext: {
        domainId: evalDomainId,
        domainName: "Eval domain",
        route: "/atlas",
        screen: "Atlas",
      },
      message:
        "Use get_domain_context for the active Atlas domain with limit 5, then summarize what you can tell from that context.",
    });

    t.completed();
    t.noFailedActions();
    t.calledTool("get_domain_context", {
      input: {
        domainId: evalDomainId,
        limit: 5,
      },
    });
  },
});
