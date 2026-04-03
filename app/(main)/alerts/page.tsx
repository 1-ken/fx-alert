import Link from "next/link";
import {
  ArrowLeftIcon,
  BellAlertIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CreateAlertForm } from "@/components/alerts/create-alert-form";

type AlertsPageProps = {
  searchParams?: Promise<{
    pair?: string | string[];
    price?: string | string[];
  }>;
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const resolvedSearchParams = await searchParams;
  const initialPair = firstSearchParam(resolvedSearchParams?.pair);
  const initialPrice = firstSearchParam(resolvedSearchParams?.price);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-8 text-foreground">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Back to dashboard"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <BellAlertIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Create New Alert</h1>
            <p className="text-sm text-muted-foreground">Set a target and choose how you want to be notified.</p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
          aria-label="Close create alert form"
        >
          <XMarkIcon className="h-5 w-5" />
        </Link>
      </div>

      <CreateAlertForm initialPair={initialPair} initialTargetPrice={initialPrice} />
    </div>
  );
}