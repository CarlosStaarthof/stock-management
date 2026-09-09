import { NextResponse } from "next/server";

import { logError } from "@/lib/log";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";

/**
 * The one place domain errors become HTTP status codes (docs/architecture.md
 * "Error handling"). Every route handler in this feature ends in this function, so
 * "not signed in" is 401 everywhere and "not allowed" is 403 everywhere.
 *
 * Anything that is not a domain error is a bug: it is logged and answered with 500, and
 * its message never reaches the client.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  logError("api.unhandled_error", {
    reason: error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
  });
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
