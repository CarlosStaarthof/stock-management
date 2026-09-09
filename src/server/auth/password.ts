import bcrypt from "bcryptjs";

/**
 * The ONLY file in this repository allowed to import the password-hashing library
 * (spec 003 AC-5, enforced by tests/unit/hashing-boundary.test.ts). The admin-creation
 * script and the credentials provider both reach hashing through here, so a second,
 * weaker hasher cannot appear in a later feature.
 *
 * Cost 10 is the floor the spec sets. bcrypt salts every hash, so the same password
 * hashed twice yields two different strings — comparison is `verifyPassword`, never
 * string equality.
 */
const BCRYPT_COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
