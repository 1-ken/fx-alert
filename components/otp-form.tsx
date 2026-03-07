"use client"

import { useState, FormEvent } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export interface OTPFormProps extends Omit<React.ComponentProps<"div">, "className"> {
  deliveryHint?: string
  onVerify: (otpCode: string) => void | Promise<void>
  onResend: () => void | Promise<void>
  isLoading?: boolean
  resendDisabled?: boolean
  className?: string
}

export function OTPForm({
  deliveryHint,
  onVerify,
  onResend,
  isLoading = false,
  resendDisabled = false,
  className,
  ...props
}: OTPFormProps) {
  const [otpValue, setOtpValue] = useState("")

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (otpValue.length !== 6 || isLoading) return
    void onVerify(otpValue)
  }

  return (
    <div className={cn("flex flex-col gap-4 sm:gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-lg sm:text-xl font-bold">Enter verification code</h1>
            <FieldDescription className="text-sm sm:text-base">
              We sent a 6-digit code to {deliveryHint || "your registered device"}
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="otp" className="sr-only">
              Verification code
            </FieldLabel>
            <InputOTP
              maxLength={6}
              id="otp"
              value={otpValue}
              onChange={setOtpValue}
              required
              containerClassName="gap-2 sm:gap-4"
              disabled={isLoading}
            >
              <InputOTPGroup className="gap-1.5 sm:gap-2.5 *:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-10 *:data-[slot=input-otp-slot]:text-lg sm:*:data-[slot=input-otp-slot]:h-16 sm:*:data-[slot=input-otp-slot]:w-12 sm:*:data-[slot=input-otp-slot]:text-xl *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup className="gap-1.5 sm:gap-2.5 *:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-10 *:data-[slot=input-otp-slot]:text-lg sm:*:data-[slot=input-otp-slot]:h-16 sm:*:data-[slot=input-otp-slot]:w-12 sm:*:data-[slot=input-otp-slot]:text-xl *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border">
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <FieldDescription className="text-center text-xs sm:text-sm">
              Didn&apos;t receive the code?{" "}
              <button
                type="button"
                onClick={() => void onResend()}
                disabled={resendDisabled || isLoading}
                className="text-primary underline underline-offset-2 hover:no-underline disabled:pointer-events-none disabled:opacity-50"
              >
                Resend
              </button>
            </FieldDescription>
          </Field>
          <Field>
            <Button type="submit" disabled={isLoading || otpValue.length !== 6} className="w-full sm:w-auto">
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
