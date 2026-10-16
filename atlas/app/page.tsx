import Link from "next/link";

import { LandingInspectorCopy } from "@/components/atlas/inspector/LandingInspectorCopy";
import { ShellGrid } from "@/components/atlas/shell/ShellGrid";
import { AtlasStageHero } from "@/components/atlas/stage/AtlasStageHero";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <ShellGrid
      backdrop="glow"
      className="grid-cols-[128px_minmax(0,1fr)_minmax(420px,28vw)] max-shell:static max-shell:min-h-svh max-shell:overflow-visible"
    >
      <aside
        className="relative z-20 flex min-h-0 min-w-0 items-center justify-center border-r border-border bg-card/60 p-6 max-shell:min-h-22 max-shell:border-r-0 max-shell:border-b max-shell:px-5 max-shell:py-4"
        aria-label="Atlas access"
      >
        <div className="grid w-20 gap-2.5 max-shell:w-[min(100%,320px)] max-shell:grid-cols-[1fr_96px_96px] max-shell:items-center">
          <p className="mono-label mb-1 text-center leading-tight text-primary max-shell:m-0 max-shell:text-left">
            Atlas
          </p>
          <Button
            className="mono-label w-full"
            type="button"
            variant="outline"
            disabled
          >
            Sign in
          </Button>
          <Button
            className="mono-label w-full"
            nativeButton={false}
            render={<Link href="/atlas" />}
            variant="secondary"
          >
            Enter
          </Button>
        </div>
      </aside>

      <section
        className="relative grid min-h-0 min-w-0 place-items-center overflow-hidden p-14 max-shell:min-h-[64svh] max-shell:px-5 max-shell:py-8"
        aria-label="Atlas introduction"
      >
        <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-1000">
          <AtlasStageHero />
        </div>
      </section>

      <aside
        className="flex min-w-0 flex-col justify-start overflow-hidden border-l border-border bg-card/95 px-10 py-14 max-shell:border-t max-shell:border-l-0 max-shell:px-5 max-shell:py-8"
        aria-label="Atlas premise"
      >
        <div className="min-h-0 w-[min(100%,46ch)] flex-1 overflow-y-auto pr-1 max-shell:w-full">
          <LandingInspectorCopy />
        </div>
      </aside>
    </ShellGrid>
  );
}
