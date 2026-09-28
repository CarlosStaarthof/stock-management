import type { NextConfig } from "next";

/**
 * Spec 016 AC-11: the security headers every response carries. They cover transport,
 * sniffing, referrer, framing and device permissions, and nothing else. There is
 * deliberately no script-source policy (D12): one needs a nonce carried through every
 * Server Component render, and the project's hydration history argues for doing that as a
 * piece of work of its own. `frame-ancestors` restricts who may frame a page, not what a
 * page may run, so it cannot affect hydration.
 */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // The build must not depend on a reachable database (spec 002 AC-5), so nothing
  // here may introduce a data source. Keep this file boring.
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS.map((header) => ({ ...header })) }];
  },
};

export default nextConfig;
