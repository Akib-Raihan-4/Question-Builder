import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="text-sm text-muted-foreground">That page or paper doesn&apos;t exist, or it isn&apos;t yours.</p>
        <Link href="/" className="text-sm underline underline-offset-4">Go to the start page</Link>
      </div>
    </main>
  );
}
