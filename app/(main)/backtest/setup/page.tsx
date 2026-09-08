import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { BacktestSetupPageContent } from "@/components/analytics/backtest-setup-page";

export default function BacktestSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      }
    >
      <BacktestSetupPageContent />
    </Suspense>
  );
}
