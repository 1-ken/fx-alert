"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import { toast } from "sonner"
import Link from "next/link"
import { OTPForm } from "@/components/otp-form"

const MFA_TOKEN_KEY = "mfa_token"
const MFA_DELIVERY_HINT_KEY = "mfa_delivery_hint"
const MFA_EXPIRES_IN_KEY = "mfa_expires_in"

const RESEND_COOLDOWN_SEC = 60

export default function OTPPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard"
  const { status, update } = useSession()

  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [deliveryHint, setDeliveryHint] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [resendDisabled, setResendDisabled] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    const token = sessionStorage.getItem(MFA_TOKEN_KEY)
    if (!token) {
      router.replace("/login")
      return
    }
    setMfaToken(token)
    setDeliveryHint(sessionStorage.getItem(MFA_DELIVERY_HINT_KEY) || "")
  }, [router])

  useEffect(() => {
    if (status === "authenticated") {
      router.push(callbackUrl)
    }
  }, [status, callbackUrl, router])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          setResendDisabled(false)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  const clearMfaStorage = useCallback(() => {
    sessionStorage.removeItem(MFA_TOKEN_KEY)
    sessionStorage.removeItem(MFA_DELIVERY_HINT_KEY)
    sessionStorage.removeItem(MFA_EXPIRES_IN_KEY)
  }, [])

  const onVerify = useCallback(
    async (otpCode: string) => {
      if (!mfaToken) {
        toast.error("Session expired. Please sign in again.")
        router.replace("/login")
        return
      }
      setIsLoading(true)
      try {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfa_token: mfaToken, otp_code: otpCode }),
        })
        const data = (await res.json().catch(() => ({}))) as { oneTimeToken?: string; message?: string }

        if (!res.ok) {
          toast.error("Verification failed", {
            description: data.message || "Invalid or expired code. Please try again.",
          })
          return
        }

        if (!data.oneTimeToken) {
          toast.error("Verification failed", { description: "Unexpected response." })
          return
        }

        clearMfaStorage()

        const result = await signIn("credentials", {
          one_time_token: data.oneTimeToken,
          redirect: false,
        })

        if (result?.error) {
          toast.error("Sign in failed", { description: result.error })
          return
        }

        await update()
        toast.success("Login successful")
        window.location.href = callbackUrl
      } catch {
        toast.error("Verification failed", { description: "An error occurred. Please try again." })
      } finally {
        setIsLoading(false)
      }
    },
    [mfaToken, callbackUrl, clearMfaStorage, update, router]
  )

  const onResend = useCallback(async () => {
    if (!mfaToken) {
      toast.error("Session expired. Please sign in again.")
      router.replace("/login")
      return
    }
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfa_token: mfaToken }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string }

      if (!res.ok) {
        toast.error("Resend failed", { description: data.message || "Could not resend code." })
        return
      }

      toast.success(data.message || "A new code has been sent.")
      setResendDisabled(true)
      setResendCooldown(RESEND_COOLDOWN_SEC)
    } catch {
      toast.error("Resend failed", { description: "An error occurred. Please try again." })
    }
  }, [mfaToken, router])

  if (mfaToken === null) {
    return (
      <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-4 sm:gap-6 sm:p-6 md:p-10">
        <div className="text-muted-foreground text-sm sm:text-base">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-4 sm:gap-6 sm:p-6 md:p-10">
      <div className="w-full max-w-xs sm:max-w-sm">
        <OTPForm
          deliveryHint={deliveryHint}
          onVerify={onVerify}
          onResend={onResend}
          isLoading={isLoading}
          resendDisabled={resendDisabled || resendCooldown > 0}
        />
      </div>
      <p className="text-muted-foreground text-center text-xs sm:text-sm">
        <Link href="/login" className="underline underline-offset-2 hover:no-underline">
          Back to login
        </Link>
      </p>
    </div>
  )
}
