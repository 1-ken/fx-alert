import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Username and password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;

        if (!username || !password) {
          return null;
        }

        const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as { user_id?: string; username?: string };
        if (!data.user_id) {
          return null;
        }

        return {
          id: data.user_id,
          name: data.username ?? username,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.authProvider = account?.provider ?? "credentials";
      }

      if (!token.userId && token.sub) {
        token.userId = token.sub;
      }

      if (token.userId) {
        const { signObserverAccessToken } = await import("@/lib/observer-access-token");
        token.accessToken = await signObserverAccessToken(String(token.userId));

        if (account?.provider === "google" && user) {
          try {
            await fetch(`${getApiBaseUrl()}/api/v1/auth/oauth/google-sync`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token.accessToken}`,
              },
              body: JSON.stringify({
                google_sub: user.id,
                email: user.email ?? null,
                display_name: user.name ?? null,
                avatar_url: user.image ?? null,
              }),
            });
          } catch {
            // Non-blocking: user can still use the app if sync fails temporarily.
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        session.user = {
          id: String(token.userId ?? token.sub ?? ""),
          name: null,
          email: null,
          image: null,
        };
      }

      session.user.id = String(token.userId ?? token.sub ?? session.user.id ?? "");
      session.user.email = (token.email as string | null | undefined) ?? session.user.email;
      session.user.name = (token.name as string | null | undefined) ?? session.user.name;
      session.user.image = (token.picture as string | null | undefined) ?? session.user.image;

      session.accessToken =
        typeof token.accessToken === "string"
          ? token.accessToken
          : await (async () => {
              const { signObserverAccessToken } = await import("@/lib/observer-access-token");
              return signObserverAccessToken(session.user.id);
            })();

      session.authProvider =
        typeof token.authProvider === "string" ? token.authProvider : undefined;

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET || "your-secret-key-change-in-production",
  debug: process.env.NODE_ENV === "development",
};
