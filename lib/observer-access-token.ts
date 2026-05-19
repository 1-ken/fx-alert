import { SignJWT } from "jose";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
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
  const cookieStore = await cookies();
  const sessionToken = await getToken({
    req: {
      headers: {
        cookie: cookieStore.toString(),
      },
    } as Request,
    secret: authOptions.secret,
  });

  const userId = sessionToken?.userId ?? sessionToken?.sub;
  if (!userId) {
    return null;
  }

  return signObserverAccessToken(String(userId));
}
