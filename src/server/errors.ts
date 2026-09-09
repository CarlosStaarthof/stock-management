/**
 * Typed domain errors.
 *
 * `docs/architecture.md`: services throw these, never `new Error()`, because the caller
 * cannot tell a bare Error from a bug. Route handlers map them to status codes in one
 * place (`src/app/api/error-response.ts`).
 *
 * `UnauthorizedError` is added by feature #3: "not signed in" (401) and "signed in but
 * not allowed" (403) are different answers with different user-facing behaviour, and a
 * service that cannot distinguish them forces the route handler to guess.
 */

/** Base class so a route handler can recognise a domain error with one `instanceof`. */
export abstract class DomainError extends Error {
  protected constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("NotFoundError", message);
  }
}

export class ValidationError extends DomainError {
  /** The field the caller got wrong, so a form can highlight it. */
  readonly field: string;

  constructor(field: string, message: string) {
    super("ValidationError", message);
    this.field = field;
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("ConflictError", message);
  }
}

/** Signed in, but this role may not do this. HTTP 403. */
export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super("ForbiddenError", message);
  }
}

/** Not signed in at all — or no longer active. HTTP 401. */
export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super("UnauthorizedError", message);
  }
}
