import type { JSX } from "react";

import { EnvStatus } from "@/components/EnvStatus";
import { parseEnv } from "@/lib/env";

/**
 * The `@/lib/env` import here is deliberate: spec 002 AC-15 requires the `@/` alias to
 * resolve in code a Playwright test exercises, not only in a unit test.
 *
 * The result is reduced to a boolean before it reaches the page. A connection string is
 * a credential and must never be rendered.
 */
function isDatabaseConfigured(): boolean {
  try {
    parseEnv(process.env);
    return true;
  } catch {
    return false;
  }
}

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Macroads Stock</h1>
      <p className="text-base text-slate-700">
        Yard stock counts, totals and variances. The Excel workbook becomes an export,
        not the system of record.
      </p>
      <EnvStatus databaseConfigured={isDatabaseConfigured()} />
    </main>
  );
}
