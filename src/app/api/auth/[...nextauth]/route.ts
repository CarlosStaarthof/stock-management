import { handlers } from "@/server/auth/next-auth";

// Auth.js's own endpoints. The instance lives under src/server/, because its credentials
// provider reads the database and src/server/ is the only layer allowed to
// (docs/architecture.md). This file re-exports; it contains no logic of its own.
export const { GET, POST } = handlers;
