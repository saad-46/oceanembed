import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <Logo size={28} />
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">This page does not exist</h1>
        <p className="mt-2 max-w-md text-sm text-ink-2">The address may be mistyped, or the page may have moved. The ocean map is a good place to start.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/map" className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-[#04121c] hover:brightness-110">
          Open the ocean map
        </Link>
        <Link href="/" className="rounded-lg border border-line-2 px-4 py-1.5 text-sm text-ink hover:border-accent/50">
          Home
        </Link>
      </div>
    </main>
  );
}
