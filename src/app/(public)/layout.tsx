import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F3]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-surface2">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-lg text-secondary-color tracking-tight font-orbitron">
            AV_FLOW
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl text-sm font-medium text-foreground hover:text-foreground border border-surface2 hover:border-secondary-color/30 transition-colors"
            >
              Log in
            </Link>

          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-surface2 bg-black">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="text-xs text-muted">
            © {new Date().getFullYear()} AV_FLOW
          </span>
          {/* <Link
            href="/terms"
            className="text-xs text-muted hover:text-secondary-color transition-colors"
          >
            Terms & Privacy Policy
          </Link> */}
        </div>
      </footer>

    </div>
  );
}