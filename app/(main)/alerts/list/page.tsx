import { AlertsListPage } from "@/components/alerts/alerts-list-page";

interface AlertsListRoutePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AlertsListRoutePage({
  searchParams,
}: AlertsListRoutePageProps) {
  const resolvedSearchParams = await searchParams;
  const statusParam = resolvedSearchParams?.status;
  const typeParam = resolvedSearchParams?.type;
  const highlightParam = resolvedSearchParams?.highlight;
  const status = Array.isArray(statusParam) ? statusParam[0] : statusParam ?? "all";
  const type = Array.isArray(typeParam) ? typeParam[0] : typeParam ?? "all";
  const highlight = Array.isArray(highlightParam) ? highlightParam[0] : highlightParam;

  return (
    <AlertsListPage
      initialStatus={status}
      initialType={type}
      initialHighlight={highlight}
    />
  );
}
