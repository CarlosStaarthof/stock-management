import type { JSX } from "react";

/**
 * Presentational only: it is told whether the database connection strings are present
 * and says so. It reads no environment and fetches no data — that decision belongs
 * above it (docs/architecture.md: components never fetch).
 *
 * It never renders a connection string. The status is a boolean by design.
 */
export function EnvStatus({
  databaseConfigured,
}: {
  databaseConfigured: boolean;
}): JSX.Element {
  return (
    <p data-testid="env-status" className="text-sm text-slate-600">
      {databaseConfigured
        ? "Database configuration present."
        : "Database configuration missing."}
    </p>
  );
}
