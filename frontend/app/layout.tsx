import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import TopNav from "@/components/TopNav";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "OceanSight — Subsurface Ocean Reconstruction",
  description:
    "SIH26066 OceanEmbed: satellite-embedding deep learning reconstruction of North Indian Ocean subsurface temperature (0–1000 m, 0.25°, daily), validated against independent Argo floats.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${space.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <TopNav />
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </body>
    </html>
  );
}
