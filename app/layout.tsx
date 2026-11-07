import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { HeaderGate } from "@/components/header-gate";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { appUrl } from "@/lib/format";
import "./globals.css";

const body = Figtree({ variable: "--font-body", subsets: ["latin"] });
const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: "BuyBox Social",
  description: "Send clients homes they can react to and talk about together.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Edge to edge on phones with a notch; the pages pad themselves clear of it.
  viewportFit: "cover",
};

export default function RootLayout({ children, modal }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        <SkipLink />
        <HeaderGate>
          <SiteHeader />
        </HeaderGate>
        <div id="main" tabIndex={-1} className="outline-none">
          {children}
        </div>
        {modal}
      </body>
    </html>
  );
}
