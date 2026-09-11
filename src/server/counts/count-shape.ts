import { shapeForRole } from "@/server/auth/role-shape";
import type { SessionUser } from "@/server/auth/session-user";

/**
 * `shapeForRole`'s first real caller for a count (AC-16).
 *
 * `getCount` returns two shapes: `CountForStaff`, and `CountForAdmin` which adds
 * `itemsWithoutPrice` — the only money-adjacent fact on this whole surface, and a count of
 * items rather than a euro. Part 6's rule is that the shape is chosen from the SESSION
 * ROLE and never from anything a client can set, so the choice is made here, once, from
 * `actor.role` alone.
 *
 * Both branches are thunks, and the admin one is allowed to be `async`: the query that
 * counts items with no price lives INSIDE it, so a staff request never issues it. That is
 * the difference between withholding a key and never asking the question.
 *
 * It takes its two builders as parameters rather than closing over them because a
 * parameter can be a `vi.fn()` and a closure cannot — AC-16's spy-thunk half runs in
 * `npm run test:unit` with no database, exactly as 003 AC-17 does.
 */
export function countForRole<TStaff, TAdmin>(
  actor: SessionUser,
  forStaff: () => TStaff,
  forAdmin: () => TAdmin,
): TStaff | TAdmin {
  return shapeForRole(actor, { forStaff, forAdmin });
}
