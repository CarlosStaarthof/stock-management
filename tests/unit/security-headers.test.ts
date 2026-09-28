import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

/**
 * Spec 016 AC-11: every response carries the security headers. This half calls the
 * configuration's own `headers()`; the served half is `tests/e2e/deploy-verify.spec.ts`,
 * against the local production build.
 *
 * The six are written out here from the spec, not imported from the configuration, so a
 * changed value in `next.config.ts` turns this red instead of changing what it expects.
 */
const EXPECTED = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

describe("016 AC-11: next.config.ts sets the security headers", () => {
  it("AC-11: poweredByHeader is false", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("AC-11: headers() gives the source /:path* exactly the six headers, and nothing else", async () => {
    expect(typeof nextConfig.headers).toBe("function");

    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([{ source: "/:path*", headers: EXPECTED }]);
  });

  it("AC-11 (D12): there is no script-source policy: the only Content-Security-Policy directive is frame-ancestors", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const policies = rules
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key.toLowerCase() === "content-security-policy")
      .map((header) => header.value);

    expect(policies).toEqual(["frame-ancestors 'none'"]);
    expect(policies.join(" ")).not.toMatch(/script-src|default-src/);
  });

  it("AC-11: the rest of the configuration is unchanged: strict mode stays on", () => {
    expect(nextConfig.reactStrictMode).toBe(true);
  });
});
