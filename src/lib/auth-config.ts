import type { NextAuthConfig } from "next-auth";

/**
 * The half of the Auth.js configuration that must be safe to import from the edge
 * runtime: no provider, no database, no bcrypt. `src/middleware.ts` builds its instance
 * from this alone, which is how it satisfies spec 003 AC-31 — the edge never needs
 * `@prisma/client`.
 *
 * `src/server/auth/next-auth.ts` spreads this and adds the credentials provider.
 */

export const SIGN_IN_PATH = "/sign-in";

/** Every route the middleware refuses to a signed-out request. */
export const PROTECTED_PATHS = [
  "/stock-entry",
  "/stock-takes",
  "/analysis",
  // Feature #6: the item master. The middleware decides SIGNED IN OR NOT and nothing
  // else; ADMIN is decided from the stored User row by `requireAdminPage` (006 AC-1).
  "/item-master",
] as const;

/** Spec 003 "Open questions": 7 days, refreshed at most once every 24 hours. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

export const baseAuthConfig = {
  // JWT, not a database session, so the middleware can refuse an unauthenticated request
  // at the edge without a database round trip. The token is a ROUTING HINT ONLY — every
  // server-side decision re-reads the User row (see src/server/auth/session.ts).
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  pages: { signIn: SIGN_IN_PATH },
  // Self-hosted, behind whatever host the deployment answers on; Auth.js otherwise
  // refuses any origin it has not been told to trust.
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        // A hint for routing only. Nothing decides access from this value.
        token.role = "role" in user && typeof user.role === "string" ? user.role : token.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
