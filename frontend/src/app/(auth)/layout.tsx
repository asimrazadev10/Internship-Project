/**
 * Layout for the auth route group ((auth) is a grouping folder — it does not appear in the URL,
 * so the pages are still /login and /register). Centres the auth card on the page.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
