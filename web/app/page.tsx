import Image from "next/image";
import { LandingDomainPanel } from "@/features/landing/LandingDomainPanel";
import { getDomainOverviewBySlug, listDomains } from "@/services/domains";

export default async function Home() {
  const domains = await listDomains("active");
  const domainOverviews = (
    await Promise.all(
      domains.map((domain) => getDomainOverviewBySlug(domain.slug))
    )
  ).filter((overview) => overview !== null);

  return (
    <main className="grid min-h-svh bg-background text-foreground md:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
      <section
        aria-label="Memoria introduction"
        className="relative grid min-h-[54svh] min-w-0 place-items-center overflow-hidden p-8 md:min-h-svh md:p-14"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(90%_76%_at_44%_36%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_62%)]"
        />
        <div className="relative z-10 grid min-h-full place-items-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-6 motion-safe:duration-1000">
          <div
            className="absolute aspect-square w-[min(64vw,420px)] rounded-full border border-primary/15 motion-safe:animate-spin md:w-[min(34vw,420px)]"
            style={{ animationDuration: "30s" }}
          >
            <span className="absolute -top-[3px] left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
          </div>
          <div
            className="absolute aspect-square w-[min(76vw,500px)] rounded-full border border-dashed border-primary/10 motion-safe:animate-spin md:w-[min(40vw,500px)]"
            style={{
              animationDelay: "-17s",
              animationDirection: "reverse",
              animationDuration: "50s",
            }}
          >
            <span className="absolute top-[27%] right-[8%] size-[5px] rounded-full bg-primary/90 shadow-[0_0_12px_var(--primary)]" />
          </div>
          <div className="relative aspect-square w-[min(54vw,340px)] overflow-hidden rounded-full shadow-[0_0_58px_-34px_var(--primary)] md:w-[min(28vw,340px)]">
            <Image
              alt=""
              className="h-[112%] w-[112%] max-w-none -translate-x-[5.35%] -translate-y-[5.35%] object-cover"
              draggable={false}
              height={1040}
              priority
              src="/landing/memoria-hero.png"
              width={1024}
            />
          </div>
        </div>
      </section>

      <LandingDomainPanel domainOverviews={domainOverviews} />
    </main>
  );
}
