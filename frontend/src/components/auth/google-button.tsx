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
 *
 * GIS is a SINGLE global instance, not a per-component one, so the three things that must happen
 * exactly once per page load — loading the script, initialize(), and owning the callback — are
 * module state below rather than component state. Doing it per-mount logged
 * "google.accounts.id.initialize() is called multiple times", after which only the last instance
 * is live and the button can go dead on navigation.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_ID = "google-identity-services";

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

function getGoogleId(): GoogleIdApi | undefined {
  return (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } })
    .google?.accounts?.id;
}

/**
 * Resolves once the GIS script is usable, and only ever loads it once.
 *
 * The promise is memoised at module scope because that is what makes the load idempotent. The
 * previous version keyed off `document.getElementById`, which looks equivalent but is not: React
 * Strict Mode mounts twice in dev, so the first mount appended the script with an `onload` handler
 * and the second mount found that same tag and added a SECOND listener to it. Both then fired.
 */
let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    if (getGoogleId()) return resolve();

    const fail = () => reject(new Error("Failed to load Google Identity Services"));

    // A tag can exist without this module having created it (e.g. after a fast refresh).
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return gisPromise;
}

// initialize() is called once with a stable callback that delegates here, so a remount can swap in
// its own handler (with its own router/setError) without re-initializing GIS.
let gisInitialized = false;
let credentialHandler: ((credential: string) => void) | null = null;

export function GoogleButton() {
  const router = useRouter();
  const { googleLogin } = useAuth();
  const holderRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;

    // Guards the async gap: the mount can end before the script finishes loading.
    let cancelled = false;

    const handler = (credential: string) => {
      void googleLogin(credential)
        .then(() => router.replace("/"))
        .catch((err: unknown) => setError(getApiErrorMessage(err)));
    };
    credentialHandler = handler;

    void loadGis()
      .then(() => {
        if (cancelled || !holderRef.current) return;

        const google = getGoogleId();
        if (!google) return;

        if (!gisInitialized) {
          google.initialize({
            client_id: CLIENT_ID,
            // Delegates rather than closing over this mount's state, so it stays valid forever.
            callback: (response) => {
              if (response.credential) credentialHandler?.(response.credential);
            },
          });
          gisInitialized = true;
        }

        // Unlike initialize(), this is per-mount: it needs THIS instance's holder element.
        google.renderButton(holderRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load Google sign-in. Check your connection.");
      });

    return () => {
      cancelled = true;
      // Only disown the callback if a later mount has not already claimed it.
      if (credentialHandler === handler) credentialHandler = null;
    };
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
