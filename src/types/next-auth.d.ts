import type { DefaultSession } from "next-auth";

import type { Role } from "@/server/auth/roles";

/**
 * Auth.js ships an open `Session`/`JWT` shape; these declarations pin the fields this
 * application puts on them. The role is a hint for routing — `getCurrentUser` re-reads the
 * `User` row rather than trusting it (spec 003 AC-11, AC-18). The epoch is compared with
 * the row's `sessionEpoch` on every request, so a PIN reset ends the session (021 AC-17).
 */
declare module "next-auth" {
  interface Session {
    user: { id: string; role?: Role } & DefaultSession["user"];
    epoch?: number;
  }

  interface User {
    role?: Role;
    epoch?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    epoch?: number;
  }
}
