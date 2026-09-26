import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";

import { baseAuthConfig } from "@/lib/auth-config";
import {
  DEVICE_COOKIE,
  SIGN_IN_REFUSALS,
  deviceCookieOptions,
  type SignInRefusal,
} from "@/server/auth/sign-in-codes";
import { attemptSignIn } from "@/server/auth/sign-in-service";

/**
 * The Auth.js (NextAuth v5) instance.
 *
 * It lives under `src/server/` because `authorize` reads the database, and `src/server/`
 * is the only layer allowed to (docs/architecture.md). `src/app/api/auth/[...nextauth]`
 * merely re-exports the handlers.
 *
 * `authorize` calls `attemptSignIn` and no other service (021 AC-31). It is reached by BOTH
 * transports — the sign-in form's server action and a direct POST to
 * `/api/auth/callback/credentials` — so both meet the same budget and the same lock, and a
 * failed attempt is evaluated, and counted, exactly once (AC-15).
 *
 * A refusal is thrown as a `CredentialsSignin` whose `code` names the outcome. From the
 * server action Auth.js rethrows it, so the form can say which of the four it was; from the
 * HTTP callback Auth.js answers with its usual redirect to the sign-in page. Nothing in
 * either carries the username or the PIN.
 */
class SignInRefused extends CredentialsSignin {
  constructor(refusal: SignInRefusal) {
    super();
    this.code = refusal;
  }
}

/** The value of one cookie in a `Cookie` header, or `null`. */
function cookieValue(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...baseAuthConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, request) {
        const username = typeof credentials?.username === "string" ? credentials.username : "";
        const pin = typeof credentials?.pin === "string" ? credentials.pin : "";
        const deviceToken = cookieValue(request.headers.get("cookie"), DEVICE_COOKIE);

        const result = await attemptSignIn(username, pin, { deviceToken });

        if (result.outcome !== "SIGNED_IN") {
          throw new SignInRefused(SIGN_IN_REFUSALS[result.outcome]);
        }

        // Issued on every successful sign-in, renewed with the same id when the browser
        // already held one (S8). Signing out leaves it.
        (await cookies()).set(DEVICE_COOKIE, result.deviceToken, deviceCookieOptions(request.url));

        return {
          id: result.user.id,
          name: result.user.name,
          role: result.user.role,
          epoch: result.sessionEpoch,
        };
      },
    }),
  ],
});
