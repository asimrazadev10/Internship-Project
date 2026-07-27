"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * "Continue with Google" via Google Identity Services (GIS).
 *
 * GIS renders its own button and, on success, hands us the Google ID token. We pass that to the
 * backend (POST /auth/google), which verifies it and issues our own session — the token-exchange
 * flow. The backend was built in Phase 1; this is just its frontend.
 *
 * Renders nothing unless NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. To work, that must equal the
 * backend's GOOGLE_CLIENT_ID, and the page's origin must be listed under the OAuth client's
 * "Authorized JavaScript origins" in Google Cloud.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_ID = "google-identity-services";

export function GoogleButton() {
  const router = useRouter();
  const { googleLogin } = useAuth();
  const holderRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID || !holderRef.current) return;

    function render() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      if (!google?.accounts?.id || !holderRef.current) return;

      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (!response.credential) return;
          void googleLogin(response.credential)
            .then(() => router.replace("/"))
            .catch((err: unknown) => setError(getApiErrorMessage(err)));
        },
      });
      google.accounts.id.renderButton(holderRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.accounts?.id) {
      render();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", render);
      return () => existing.removeEventListener("load", render);
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [googleLogin, router]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={holderRef} className="min-h-[44px]" />
      {error && (
        <p role="alert" className="text-sm text-brand-strong">
          {error}
        </p>
      )}
    </div>
  );
}
