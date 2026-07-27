import { AuthHero } from "@/components/auth/auth-hero";
import { Logo } from "@/components/ui/logo";

/**
 * Auth route group ((auth) does not appear in the URL — pages stay /login and /register).
 * Split layout: the conversation vignette on the left (desktop), the form on the right. On
 * smaller screens the vignette is dropped and a compact wordmark leads the form.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[1.1fr_1fr]">
      <AuthHero />
      <main className="flex items-center justify-center px-5 py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
