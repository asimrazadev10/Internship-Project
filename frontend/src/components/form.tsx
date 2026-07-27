import type { InputHTMLAttributes } from "react";

import {
  EYEBROW_CLASS,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/components/ui/styles";

/** Presentational form primitives shared by the auth pages, styled from the design tokens. */

export function Field({
  label,
  id,
  ...props
}: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={EYEBROW_CLASS}>
        {label}
      </label>
      <input id={id} className={`${INPUT_CLASS} text-ink`} {...props} />
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
      className={`${PRIMARY_BUTTON_CLASS} mt-1 inline-flex items-center justify-center px-4 py-2.5 shadow-sm`}
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
      <span className={EYEBROW_CLASS}>or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
