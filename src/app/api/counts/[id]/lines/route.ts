import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/error-response";
import { SAVE_REQUEST_INVALID } from "@/lib/count-messages";
import { requireUser } from "@/server/auth/session";
import { parseSaveQuantitiesBody } from "@/server/counts/count-input";
import { saveQuantities } from "@/server/counts/count-entry-service";
import { ValidationError } from "@/server/errors";

/**
 * `POST /api/counts/<countId>/lines` — autosave.
 *
 * THE FIRST WRITE IN THIS PRODUCT A CLIENT MAKES WITH JAVASCRIPT. #7 had none; a counter
 * who has to press *Save* between every row walks a yard remembering to press *Save*, and
 * eventually goes back to paper. So the screen sends what was typed, and this is where it
 * arrives.
 *
 * IT IS DELIBERATELY OUTSIDE `src/middleware.ts`'s MATCHER, which covers `/stock-entry`
 * and three siblings but not `/api/` (008 AC-1). A signed-out `POST` therefore gets this
 * handler and a JSON `401`, rather than the `307` to `/sign-in` that a page gets — a
 * redirect to an HTML sign-in form is not something a `fetch` in a save loop can use, and
 * following it would turn a refusal into a `200` carrying a login page. `auth-config.ts`
 * and `middleware.ts` are byte-identical after this feature.
 *
 * FOUR LINES OF WORK, AND NO MORE. One `requireUser()`, one parse at the edge of
 * `src/server/`, one service call, one `errorResponse` — no Prisma query of its own
 * (`docs/architecture.md`), and nothing read from the body, a header or a cookie except
 * the edits themselves. Who is saving is the session's answer and the client cannot
 * influence it: a body carrying `role` or `userId` is refused by the strict schema rather
 * than honoured (008 AC-19).
 *
 * THE RESPONSE HAS ONE SHAPE FOR BOTH ROLES, because it carries no money at all: an id, a
 * quantity per edited line and three counts. It therefore does not go through
 * `shapeForRole`, and an `ADMIN`'s body is deeply equal to a `YARD_STAFF`'s for the same
 * request (008 AC-17). There is no running total in it, and none on the screen (AC-18).
 *
 * `GET`, `PUT` and `DELETE` answer `405`: Next implements every method a route module does
 * not export with a 405 response
 * (`next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js`), so the
 * refusal is the framework's and there is no second handler here to keep in step (AC-10).
 */
export const dynamic = "force-dynamic";

/** A body that is not JSON at all is the same kind of wrong as a body of the wrong shape. */
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new ValidationError("edits", SAVE_REQUEST_INVALID);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // First, and before the body is even read: a signed-out request is refused whatever it
    // carries, and nothing it carries can change who it is from.
    const actor = await requireUser();
    const { id } = await params;

    const edits = parseSaveQuantitiesBody(await readJsonBody(request));

    return NextResponse.json(await saveQuantities(actor, id, edits));
  } catch (error) {
    return errorResponse(error);
  }
}
