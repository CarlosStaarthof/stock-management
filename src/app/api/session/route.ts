import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/error-response";
import { landingPathForRole } from "@/server/auth/landing";
import { requireUser } from "@/server/auth/session";

/**
 * Who am I? — the endpoint the end-to-end tests ask, because a response body is the only
 * honest place to check what a session is actually sent.
 *
 * The role in the answer comes from `requireUser`, which re-reads the `User` row. No
 * query parameter, header, cookie or form field is consulted, which is exactly why GET
 * and POST share one implementation (AC-18).
 */
export const dynamic = "force-dynamic";

async function currentSession(): Promise<NextResponse> {
  try {
    const user = await requireUser();

    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      landingPath: landingPathForRole(user.role),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(): Promise<NextResponse> {
  return currentSession();
}

export async function POST(): Promise<NextResponse> {
  return currentSession();
}
