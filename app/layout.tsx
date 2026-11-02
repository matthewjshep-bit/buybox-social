import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
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
};

export default function RootLayout({ children, modal }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        {children}
        {modal}
      </body>
    </html>
  );
}
