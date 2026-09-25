import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

import { HydrationGate } from "@/components/HydrationGate";

import "./globals.css";

/**
 * `description` no longer says "totals", and the reason is spec 006 AC-2 rather than
 * taste. This tag is emitted on EVERY response the application makes, including the 307
 * shell Next returns when `requireAdminPage` refuses a YARD_STAFF session — so the word
 * "totals" was the single thing standing between that refusal and the criterion's
 * money-word scan. Narrowing one blurb is a smaller price
 * than carving a permanent exception into a money-boundary assertion, and the sentence is
 * no less true: the counts and the variances are what the product is for.
 */
export const metadata: Metadata = {
  title: "Macroads Stock",
  description: "Yard stock counts and variances for Macroads.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {/*
          Every page renders inside the gate, so no element a page renders can be hydrated
          while the document is still being parsed. Why that matters, and what it cost when
          it was not so: `src/components/HydrationGate.tsx`.
        */}
        <HydrationGate>{children}</HydrationGate>
      </body>
    </html>
  );
}
