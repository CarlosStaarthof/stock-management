import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/error-response";
import { requireRole } from "@/server/auth/session";
import { listUsers } from "@/server/auth/user-service";

/**
 * ADMIN only, and refused by the service rather than by the middleware: deleting the
 * middleware entry would not expose this (AC-16). `listUsers` selects five columns by
 * name, so no hash can be forwarded (AC-20).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireRole("ADMIN");

    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}
