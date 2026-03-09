import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Validates that the request has an authenticated session.
 * Returns the session if valid, or an error response if not.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      ),
      session: null,
    };
  }

  return { error: null, session };
}

/**
 * Validates authentication for API routes.
 * Use this at the start of API handlers that require authentication.
 * 
 * @example
 * export async function GET() {
 *   const authCheck = await requireAuth();
 *   if (authCheck.error) return authCheck.error;
 *   
 *   // Continue with authenticated logic
 * }
 */
export async function validateApiAuth(): Promise<
  | { authenticated: true; session: NonNullable<Awaited<ReturnType<typeof getServerSession>>> }
  | { authenticated: false; response: NextResponse }
> {
  const { error, session } = await requireAuth();

  if (error) {
    return { authenticated: false, response: error };
  }

  return { authenticated: true, session: session! };
}
