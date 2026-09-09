/**
 * The application's logger.
 *
 * It exists so that `docs/conventions.md`'s ban on `console.log` in `src/` has somewhere
 * to point, and so that everything written to the console goes through one function that
 * can be given a destination later.
 *
 * Nothing here ever receives a password: callers pass an event name and a small record of
 * non-secret context. Spec 003 AC-4 asserts, with spies on all four console methods, that
 * a plaintext password never reaches any of them.
 */

type LogContext = Record<string, string | number | boolean | null>;

function render(event: string, context: LogContext): string {
  const pairs = Object.entries(context).map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length > 0 ? `${event} ${pairs.join(" ")}` : event;
}

export function logWarn(event: string, context: LogContext = {}): void {
  console.warn(render(event, context));
}

export function logError(event: string, context: LogContext = {}): void {
  console.error(render(event, context));
}
