import Link from "next/link";

export default function PublicLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="">
        <div className="max-w-3xl mx-auto px-6 py-28 text-center space-y-8">
          <div className="animate-fade-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary-color/10 border border-secondary-color/20 text-secondary-color text-xs font-semibold tracking-widest uppercase">
            BETA -  AV at Call One, Inc.
          </div>
          <div className="animate-fade-up-3 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl border border-surface2 text-muted text-sm font-medium hover:text-foreground hover:border-secondary-color/30 transition-all duration-150"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>




    </>
  );
}
