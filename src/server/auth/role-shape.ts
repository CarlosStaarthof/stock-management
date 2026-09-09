import type { SessionUser } from "@/server/auth/session-user";

/**
 * Choose a response shape from the session role, and build ONLY that one.
 *
 * This is the money boundary as a mechanism rather than a habit
 * (`specs/domain-model.md` Part 6, `docs/architecture.md` "The money boundary").
 * `src/server/counts/` will use it for `CountForStaff` / `CountForAdmin` in feature #8;
 * it ships here, tested, before there is any money to leak.
 *
 * Both branches are thunks so the admin shape is never even constructed for a
 * YARD_STAFF user — an unbuilt object cannot be serialised by accident.
 *
 * It takes `user`, never a role from a query parameter, a header or a body: the only
 * argument that decides is one the client cannot set (AC-17, AC-18).
 */
export function shapeForRole<S, A>(
  user: SessionUser,
  shapes: { forStaff: () => S; forAdmin: () => A },
): S | A {
  return user.role === "ADMIN" ? shapes.forAdmin() : shapes.forStaff();
}
