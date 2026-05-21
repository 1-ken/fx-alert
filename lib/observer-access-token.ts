import { SignJWT } from "jose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ACCESS_TOKEN_TTL = "1h";

export async function signObserverAccessToken(userId: string): Promise<string> {
  const secret = authOptions.secret;
  if (!secret || typeof secret !== "string") {
    throw new Error("NEXTAUTH_SECRET is not configured");
  }

  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}

export async function resolveObserverAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const existingToken = session?.accessToken;
  if (typeof existingToken === "string" && existingToken.length > 0) {
    return existingToken;
  }

  return signObserverAccessToken(userId);
}
