import type { InputHTMLAttributes } from "react";

/** Presentational form primitives shared by the auth pages, styled from the design tokens. */

export function Field({
  label,
  id,
  ...props
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-mono text-xs uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
        {...props}
      />
    </div>
  );
}

export function SubmitButton({
  children,
  pending,
}: {
  children: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "One moment…" : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-sm text-brand-strong"
    >
      {message}
    </p>
  );
}

/** "or" rule between the credential form and the Google button. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-xs uppercase tracking-wide">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
