import { ImageResponse } from "next/og";

import {
  BRAND_CHIP_GRADIENT,
  MARK_ARC_32,
  MARK_DOTS_32,
  MARK_STROKE_WIDTH_32,
} from "@/lib/brand.constants";

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
          background: BRAND_CHIP_GRADIENT,
        }}
      >
        <svg width="112" height="112" viewBox="0 0 32 32" fill="none">
          <path
            d={MARK_ARC_32}
            stroke="#fff"
            strokeWidth={MARK_STROKE_WIDTH_32}
            strokeLinecap="round"
            opacity="0.4"
          />
          {MARK_DOTS_32.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="#fff" opacity={d.opacity} />
          ))}
        </svg>
      </div>
    ),
    { ...size },
  );
}
