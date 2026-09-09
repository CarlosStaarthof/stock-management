import type { DefaultSession } from "next-auth";

import type { Role } from "@/server/auth/roles";

/**
 * Auth.js ships an open `Session`/`JWT` shape; these declarations pin the two fields
 * this application puts on them. Both are hints for routing — `getCurrentUser` re-reads
 * the `User` row rather than trusting either (spec 003 AC-11, AC-18).
 */
declare module "next-auth" {
  interface Session {
    user: { id: string; role?: Role } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}
