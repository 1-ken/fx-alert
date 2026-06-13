"use client";

import { useState, useEffect, useRef } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import Image from "next/image";
import { toast } from "sonner";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  normalizeReferralCode,
  persistReferralCode,
  readReferralCode,
} from "@/lib/referral";

interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  visible: boolean;
  onToggleVisible: () => void;
}

/**
 * Password input with an accessible show/hide visibility toggle.
 */
function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  visible,
  onToggleVisible,
}: PasswordFieldProps) {
  return (
    <InputGroup className="h-11">
      <InputGroupInput
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="h-11"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-sm"
          className="active:scale-[0.97]"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={onToggleVisible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const authError = searchParams.get("error");
  const initialTab = searchParams.get("tab");
  const referralParam = searchParams.get("ref");
  const { data: session, status } = useSession();
  const hasShownErrorRef = useRef(false);

  useEffect(() => {
    if (referralParam) {
      const normalized = normalizeReferralCode(referralParam);
      if (normalized) {
        persistReferralCode(normalized);
        setActiveTab("register");
      }
    }
  }, [referralParam]);

  useEffect(() => {
    if (initialTab === "register") {
      setActiveTab("register");
    }
  }, [initialTab]);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  useEffect(() => {
    if (authError !== "disabled" || hasShownErrorRef.current) {
      return;
    }

    hasShownErrorRef.current = true;
    toast.error("Your account is disabled. Contact the administrator.");
  }, [authError]);

  useEffect(() => {
    if (authError === "CredentialsSignin" && !hasShownErrorRef.current) {
      hasShownErrorRef.current = true;
      toast.error("Invalid username or password.");
    }
  }, [authError]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialsSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        username: username.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        toast.error("Invalid username or password.");
        return;
      }

      if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedUsername = username.trim().toLowerCase();

    if (normalizedUsername.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }

    if (!/^[a-z0-9_.]{3,32}$/.test(normalizedUsername)) {
      toast.error("Username can only use letters, numbers, underscores, and dots.");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    const marketerCode = readReferralCode();

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalizedUsername,
          password,
          ...(marketerCode ? { marketer_code: marketerCode } : {}),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        let message = "Could not create account. Try a different username.";
        if (typeof payload.detail === "string") {
          message = payload.detail;
        } else if (Array.isArray(payload.detail)) {
          message = payload.detail
            .map((entry: { msg?: string }) => entry.msg)
            .filter(Boolean)
            .join(". ");
        }
        toast.error(message || "Could not create account.");
        return;
      }

      toast.success("Account created. Signing you in...");

      const signInResult = await signIn("credentials", {
        username: normalizedUsername,
        password,
        redirect: false,
        callbackUrl,
      });

      if (signInResult?.error) {
        toast.error("Account created, but sign-in failed. Please sign in manually.");
        setActiveTab("signin");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="bg-muted relative hidden md:block md:min-h-140 md:shrink-0">
            <Image
              src="/assets/fxlogo.png"
              alt="fx-alert Background"
              fill
              sizes="50vw"
              className="object-cover dark:brightness-[0.2] dark:grayscale"
              unoptimized
            />
          </div>
          <div className="flex w-full flex-col items-center">
            <div className="relative h-32 w-32 shrink-0">
              <Image
                src="/assets/fxlogo.webp"
                alt="fx-alert Logo"
                fill
                sizes="32px"
                className="object-contain"
                unoptimized
              />
            </div>

            <div className="w-full">
              <div className="p-6 md:p-8">
                <FieldGroup>
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="text-2xl font-bold">Welcome</h1>
                    <p className="text-sm text-balance text-muted-foreground">
                      Sign in with username or Google
                    </p>
                  </div>

                  {authError === "disabled" && (
                    <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      Your account is disabled. Contact the administrator.
                    </p>
                  )}

                  <Tabs
                    value={activeTab}
                    onValueChange={(value) =>
                      setActiveTab(value === "register" ? "register" : "signin")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="signin">Sign in</TabsTrigger>
                      <TabsTrigger value="register">Create account</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {activeTab === "signin" ? (
                    <form onSubmit={handleCredentialsSignIn} className="space-y-3">
                      <Input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Username"
                        autoComplete="username"
                        required
                        className="h-11"
                      />
                      <PasswordField
                        id="signin-password"
                        value={password}
                        onChange={setPassword}
                        placeholder="Password"
                        autoComplete="current-password"
                        visible={showPassword}
                        onToggleVisible={() => setShowPassword((prev) => !prev)}
                      />
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Spinner className="mr-2 h-4 w-4" />
                            Please wait...
                          </>
                        ) : (
                          "Sign in"
                        )}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-3">
                      <Input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Username (3-32 characters)"
                        autoComplete="username"
                        required
                        className="h-11"
                      />
                      <PasswordField
                        id="register-password"
                        value={password}
                        onChange={setPassword}
                        placeholder="Password (min 8 characters)"
                        autoComplete="new-password"
                        visible={showPassword}
                        onToggleVisible={() => setShowPassword((prev) => !prev)}
                      />
                      <PasswordField
                        id="register-confirm-password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Confirm password"
                        autoComplete="new-password"
                        visible={showConfirmPassword}
                        onToggleVisible={() => setShowConfirmPassword((prev) => !prev)}
                      />
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Spinner className="mr-2 h-4 w-4" />
                            Please wait...
                          </>
                        ) : (
                          "Create account"
                        )}
                      </Button>
                    </form>
                  )}

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" />
                        Please wait...
                      </>
                    ) : (
                      "Continue with Google"
                    )}
                  </Button>
                </FieldGroup>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
