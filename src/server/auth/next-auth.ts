import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { baseAuthConfig } from "@/lib/auth-config";
import { verifyCredentials } from "@/server/auth/user-service";

/**
 * The Auth.js (NextAuth v5) instance.
 *
 * It lives under `src/server/` because `authorize` reads the database, and `src/server/`
 * is the only layer allowed to (docs/architecture.md). `src/app/api/auth/[...nextauth]`
 * merely re-exports the handlers.
 *
 * `authorize` delegates to `verifyCredentials`, so a wrong password, an unknown email and
 * a deactivated account are one answer — `null` — here as everywhere else.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...baseAuthConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (email === "" || password === "") return null;

        const user = await verifyCredentials(email, password);
        if (user === null) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
