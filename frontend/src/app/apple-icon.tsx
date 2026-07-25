import { ImageResponse } from "next/og";

/**
 * The iOS home-screen icon.
 *
 * Next's `apple-icon` convention accepts raster only (.jpg/.jpeg/.png) — unlike `icon`, which
 * takes SVG. Generating it with ImageResponse gives a real 180x180 PNG without committing a
 * binary blob to the repo, and keeps the geometry in step with brand-mark.tsx.
 *
 * Hex is hard-coded: no stylesheet exists at build time.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6366F1, #22D3EE)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 32 32" fill="none">
          <path
            d="M 3.3 22 C 9.3 14, 18 24, 28.7 12.7"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.4"
          />
          <circle cx="12" cy="13.3" r="6" fill="#fff" opacity="0.55" />
          <circle cx="20" cy="18.7" r="6" fill="#fff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
