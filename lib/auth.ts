import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getApiUrl, API_ENDPOINTS } from "@/lib/constants";
import { getAndDeleteOneTimeToken } from "@/lib/auth-cache";

interface RefreshResponse {
  message: string;
  access_token: string;
}

// Token expiration times (in milliseconds)
const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Check if access token is expired or about to expire (within 5 minutes)
 */
const isAccessTokenExpired = (expiryTime: number): boolean => {
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return now >= expiryTime - bufferTime;
};

/**
 * Refresh the access token using the refresh token
 */
const refreshAccessToken = async (refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> => {
  try {
    const refreshUrl = getApiUrl(API_ENDPOINTS.AUTH.REFRESH);
    
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to refresh token");
    }

    const data: RefreshResponse = await response.json();
    
    if (!data.access_token) {
      throw new Error("No access token in refresh response");
    }
    
    // The refresh endpoint only returns a new access_token, not a new refresh_token
    // So we keep the existing refresh_token
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Keep the existing refresh token
      expiresAt: Date.now() + ACCESS_TOKEN_EXPIRY,
    };
  } catch (error) {
    console.error("Error refreshing token:", error);
    throw error;
  }
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        one_time_token: { label: "One-time token", type: "text" },
      },
      async authorize(credentials) {
        const oneTimeToken = credentials?.one_time_token;
        if (!oneTimeToken) {
          return null;
        }

        const cached = getAndDeleteOneTimeToken(oneTimeToken);
        if (!cached) {
          return null;
        }

        return {
          id: cached.user.id,
          name: cached.user.name,
          email: cached.user.phone,
          phone: cached.user.phone,
          accessToken: cached.accessToken,
          refreshToken: cached.refreshToken,
          accessTokenExpiresAt: cached.accessTokenExpiresAt,
          refreshTokenExpiresAt: cached.refreshTokenExpiresAt,
          role: cached.user.role,
          branch: cached.user.branch,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Initial sign in
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.refreshToken = (user as any).refreshToken;
        token.accessTokenExpiresAt = (user as any).accessTokenExpiresAt;
        token.refreshTokenExpiresAt = (user as any).refreshTokenExpiresAt;
        token.phone = (user as any).phone;
        token.role = (user as any).role;
        token.branch = (user as any).branch;
        return token;
      }

      // Check if access token needs to be refreshed
      const accessTokenExpiresAt = token.accessTokenExpiresAt as number;
      if (accessTokenExpiresAt && isAccessTokenExpired(accessTokenExpiresAt)) {
        const refreshToken = token.refreshToken as string;
        const refreshTokenExpiresAt = token.refreshTokenExpiresAt as number;

        // Check if refresh token is still valid
        if (refreshToken && refreshTokenExpiresAt && Date.now() < refreshTokenExpiresAt) {
          try {
            const refreshed = await refreshAccessToken(refreshToken);
            token.accessToken = refreshed.accessToken;
            token.refreshToken = refreshed.refreshToken; // Keep existing refresh token
            token.accessTokenExpiresAt = refreshed.expiresAt;
            // Refresh token expiry remains the same since backend doesn't issue a new one
          } catch (error) {
            // If refresh fails, clear tokens to force re-login
            console.error("Token refresh failed:", error);
            token.accessToken = undefined;
            token.refreshToken = undefined;
            token.accessTokenExpiresAt = undefined;
            token.refreshTokenExpiresAt = undefined;
          }
        } else {
          // Refresh token expired, clear tokens
          token.accessToken = undefined;
          token.refreshToken = undefined;
          token.accessTokenExpiresAt = undefined;
          token.refreshTokenExpiresAt = undefined;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.phone = token.phone as string;
        (session as any).accessToken = token.accessToken;
        (session as any).refreshToken = token.refreshToken;
        (session as any).role = token.role;
        (session as any).branch = token.branch;
        (session as any).accessTokenExpiresAt = token.accessTokenExpiresAt;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: REFRESH_TOKEN_EXPIRY / 1000, // Convert to seconds
  },
  secret: process.env.NEXTAUTH_SECRET || "your-secret-key-change-in-production",
};
