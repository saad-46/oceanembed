import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "OceanSight — Subsurface Ocean Intelligence", template: "%s — OceanSight" },
  description:
    "Explore reconstructed North Indian Ocean temperature across space, depth and time (0–1000 m, 0.25°, daily, 2019–2023), with uncertainty, derived heat content and validation against independent Argo observations.",
  applicationName: "OceanSight",
  openGraph: {
    type: "website",
    siteName: "OceanSight",
    title: "OceanSight — Subsurface Ocean Intelligence",
    description: "See beneath the surface: reconstructed ocean temperature structure across space, depth and time, with observations, uncertainty and validation.",
  },
  twitter: { card: "summary", title: "OceanSight — Subsurface Ocean Intelligence" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${space.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">{children}</body>
    </html>
  );
}
