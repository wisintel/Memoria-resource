import type { ReactNode } from "react";
import { InspectorSection, InspectorStack } from "./InspectorBlocks";

type InspectorRailProps = {
  children: ReactNode;
  className?: string;
};

type InspectorRailSectionProps = {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  lede?: boolean;
  meta?: ReactNode;
  title?: string;
};

export function InspectorRail({ children, className }: InspectorRailProps) {
  return <InspectorStack className={className}>{children}</InspectorStack>;
}

export function InspectorRailSection({
  bodyClassName,
  children,
  className,
  eyebrow,
  lede = false,
  meta,
  title,
}: InspectorRailSectionProps) {
  return (
    <InspectorSection
      bodyClassName={bodyClassName}
      className={className}
      lede={lede}
      meta={meta}
      subtitle={eyebrow}
      title={title}
    >
      {children}
    </InspectorSection>
  );
}
