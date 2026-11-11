import { SessionProvider } from "@/components/session";
import type { Metadata, Viewport } from "next";
import { BrandScope, HeaderGate } from "@/components/header-gate";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/format";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: "Porchcard",
  description: "Send clients homes they can react to and talk about together.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Edge to edge on phones with a notch; the pages pad themselves clear of it.
  viewportFit: "cover",
};

export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${fontVariables} antialiased`}>
      <body className="min-h-dvh font-sans">
        <SkipLink />
        <SessionProvider signedIn={Boolean(user?.role)}>
        <BrandScope brand={user?.role === "agent" ? user.brand_color : null}>
          <HeaderGate>
            <SiteHeader />
          </HeaderGate>
          {/* Clear of a notch at the sides, on a phone on its side. (The
              full-screen feed is fixed to the screen and pads itself.) */}
          <div
            id="main"
            tabIndex={-1}
            className="pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] outline-none"
          >
            {children}
          </div>
          {modal}
        </BrandScope>
        </SessionProvider>
      </body>
    </html>
  );
}
