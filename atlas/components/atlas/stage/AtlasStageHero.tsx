import Image from "next/image";

export function AtlasStageHero() {
  return (
    <div className="relative z-10 grid min-h-full place-items-center" aria-hidden="true">
      <div className="absolute aspect-square w-[min(34vw,420px)] animate-spin rounded-full border border-primary/15 [animation-duration:72s] max-shell:w-[min(72vw,320px)]">
        <span className="absolute -top-[3px] left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
      </div>
      <div className="absolute aspect-square w-[min(40vw,500px)] animate-spin rounded-full border border-dashed border-primary/10 [animation-direction:reverse] [animation-duration:116s] max-shell:w-[min(82vw,380px)]" />
      <div className="relative aspect-square w-[min(23vw,280px)] overflow-hidden rounded-full opacity-75 shadow-[0_0_94px_-24px_var(--primary)] ring-1 ring-primary/20 max-shell:w-[min(52vw,240px)]">
        <Image
          className="object-cover saturate-95 contrast-[1.02]"
          src="/landing/atlas-hero.jpg"
          alt=""
          fill
          priority={false}
          sizes="(max-width: 900px) 52vw, 24vw"
        />
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(120%_120%_at_50%_12%,transparent_58%,color-mix(in_oklch,var(--background)_54%,transparent))]" />
      </div>
    </div>
  );
}
