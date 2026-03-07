"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    // TODO: Implement forgot password API call
    // For now, just show a success message
    setTimeout(() => {
      setMessage("If an account exists with this phone number, you will receive password reset instructions.");
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardContent className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Forgot Password</h1>
                <p className="text-muted-foreground text-balance">
                  Enter your phone number to receive password reset instructions
                </p>
              </div>
              {message && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  {message}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="0712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </Field>
                <Field>
                  <Button type="submit" disabled={isLoading} className="w-full">
                    {isLoading ? "Sending..." : "Send Reset Instructions"}
                  </Button>
                </Field>
              </form>
              <FieldDescription className="text-center">
                Remember your password?{" "}
                <Link href="/login" className="underline-offset-2 hover:underline">
                  Back to login
                </Link>
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
