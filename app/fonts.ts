import { Figtree, Fraunces } from "next/font/google";

const body = Figtree({ variable: "--font-body", subsets: ["latin"] });
const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"] });

// The site's two typefaces, for the page and for the page shown when even
// that breaks.
export const fontVariables = `${body.variable} ${heading.variable}`;
