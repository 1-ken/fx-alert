import { AlertsListPage } from "@/components/alerts/alerts-list-page";

interface AlertsListRoutePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AlertsListRoutePage({
  searchParams,
}: AlertsListRoutePageProps) {
  const resolvedSearchParams = await searchParams;
  const statusParam = resolvedSearchParams?.status;
  const status = Array.isArray(statusParam) ? statusParam[0] : statusParam ?? "all";

  return <AlertsListPage initialStatus={status} />;
}
