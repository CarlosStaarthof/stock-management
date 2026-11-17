import { NextResponse } from "next/server";

import { errorResponse } from "@/app/api/error-response";
import { requireAdminOrAbove } from "@/server/auth/session";
import { exportWorkbook } from "@/server/export/export-service";

/**
 * `GET /analysis/export/download` — one depot's workbook for one stock take.
 *
 * FOUR LINES OF WORK, AND NO MORE: `requireRole` refuses a non-`ADMIN` before the service
 * runs, the query string is read, the service builds the file, and `errorResponse` turns a
 * typed refusal into its status. There is no Prisma query here (`docs/architecture.md`), and
 * the role is the session's answer — nothing the client sets can influence it (003 AC-16).
 *
 * THE GUARD IS NOT THE ONLY ONE. The service asserts `ADMIN` again as its first statement, so
 * deleting `requireRole` here would still expose nothing (AC-8).
 *
 * A SECOND SEGMENT, NOT THE PAGE'S OWN (`/analysis/export`). Next refuses a `page.tsx` and a
 * `route.ts` in one segment, so the listing page keeps `/analysis/export` and the download
 * handler sits one below it. The page links here with `exportHref`.
 */
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdminOrAbove();
    const params = new URL(request.url).searchParams;

    const { fileName, bytes } = await exportWorkbook(actor, {
      showAll: params.get("all") === "1",
      locationCode: params.get("location") ?? "",
      periodKey: params.get("period") ?? "",
    });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
