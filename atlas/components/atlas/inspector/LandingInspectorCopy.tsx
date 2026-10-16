import { InspectorRail, InspectorRailSection } from "./InspectorRail";

export function LandingInspectorCopy() {
  return (
    <InspectorRail>
      <InspectorRailSection lede>
        <p>
          AI can refract any information into any shape. It cannot tell you which shape matters.
          That part is yours, and there is no tool built for it.
        </p>
      </InspectorRailSection>

      <InspectorRailSection eyebrow="The problem">
        <p>
          Most knowledge tools store what you&apos;ve read. They do not capture{" "}
          <em>how you understand it</em>. The shape of your thinking — what you treat as
          foreground, what you set aside, how concepts relate for you and not for someone else —
          lives only in your head, and erodes with every session that ends.
        </p>
      </InspectorRailSection>

      <InspectorRailSection eyebrow="The premise">
        <p>
          Understanding is not facts. It is the <em>shape</em> facts take when a mind decides what
          matters. Memoria is built on that distinction: claims are what is known, structure is what
          you understand, and the two are kept separate on purpose.
        </p>
      </InspectorRailSection>

      <InspectorRailSection eyebrow="The work">
        <p>
          Source material flows in. AI does the consolidation — extracting, indexing, surfacing. You
          do the irreducible part: deciding what is salient, naming the clusters worth naming,
          drawing the relationships that carry meaning. The graph becomes the externalized shape of
          your understanding — durable, legible, yours.
        </p>
      </InspectorRailSection>

      <InspectorRailSection eyebrow="Why it matters">
        <p>
          AI is a lens, not an eye. The eye stays human. Memoria is for people who want to keep it
          that way — to use AI&apos;s refractive power without surrendering the act of understanding
          itself.
        </p>
      </InspectorRailSection>
    </InspectorRail>
  );
}
