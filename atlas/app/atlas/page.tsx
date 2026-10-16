import { AtlasShell } from "@/components/atlas/shell/AtlasShell";

type AtlasPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AtlasPage({ searchParams }: AtlasPageProps) {
  const params = (await searchParams) ?? {};

  return (
    <AtlasShell
      domainParam={stringParam(params.domain)}
      viewParam={stringParam(params.view)}
    />
  );
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
