/**
 * Environment parsing.
 *
 * `parseEnv` is pure: it reads the record it is handed and never touches
 * `process.env` itself, so it is testable without an environment and cannot be the
 * reason a build or a test needs a `.env` file. It also never opens a connection —
 * it only checks that the two connection strings are present.
 */

export type AppEnv = {
  /** Neon's POOLED connection — used by the application at runtime. */
  databaseUrl: string;
  /** The unpooled connection — used by `prisma migrate`, which fails through a pooler. */
  directUrl: string;
};

/**
 * Thrown when a required variable is absent or empty. The message names the
 * variable, because "invalid environment" tells the reader nothing they can act on.
 */
export class MissingEnvVariableError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Environment variable ${variable} is missing or empty`);
    this.name = "MissingEnvVariableError";
    this.variable = variable;
  }
}

function requireVariable(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (value === undefined || value.trim() === "") {
    throw new MissingEnvVariableError(name);
  }
  return value;
}

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  return {
    databaseUrl: requireVariable(source, "DATABASE_URL"),
    directUrl: requireVariable(source, "DIRECT_URL"),
  };
}
