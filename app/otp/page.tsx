import { Suspense } from "react"
import OTPPageClient from "./otp-page-client"

export default function OTPPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-4 sm:gap-6 sm:p-6 md:p-10">
          <div className="text-muted-foreground text-sm sm:text-base">Loading...</div>
        </div>
      }
    >
      <OTPPageClient />
    </Suspense>
  )
}
