import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

/**
 * The internal pages (ichi, connect, settings, sign-in) were designed for
 * the polar-night theme. The root body is light paper now, so this group
 * re-wraps itself in the dark palette — the pages below stay untouched.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-dark flex min-h-screen flex-col">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
