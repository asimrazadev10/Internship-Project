import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  AURORA_CANVAS_DARK,
  AURORA_MUTED_ON_DARK,
  AURORA_TEXT_ON_DARK,
  BRAND_CHIP_GRADIENT,
  BRAND_CYAN,
  BRAND_INDIGO,
  BRAND_VIOLET,
  MARK_ARC_32,
  MARK_DOTS_32,
  MARK_STROKE_WIDTH_32,
  SITE_TAGLINE,
} from "@/lib/brand.constants";

/**
 * The social card — what a shared link renders as on Slack, WhatsApp, X, LinkedIn.
 *
 * Generated at build time rather than committed as a PNG, so the card is code: it uses the real
 * Aurora gradient and the real display face, and it changes when the brand does.
 *
 * Two constraints shape this file:
 *  1. Satori (what ImageResponse renders through) cannot see the next/font setup in layout.tsx,
 *     so the TTF is read off disk. It must be a STATIC instance — Satori's font parser throws
 *     "Cannot read properties of undefined" on a variable font's tables, so `SpaceGrotesk[wght].ttf`
 *     from the google/fonts repo does not work here. This file is the static 700 weight pulled
 *     from the Google Fonts CSS API. If it ever goes missing, drop the `fonts` option and Satori
 *     falls back to its bundled sans — degraded type beats a broken build.
 *  2. Satori supports only a CSS subset: flexbox only, and every element with more than one child
 *     needs an explicit `display: flex`. Hence the display:flex on wrappers that look redundant.
 *
 * Hex is hard-coded because no stylesheet exists at build time — the app's custom properties
 * cannot reach here. Keep in step with globals.css.
 */

export const alt = "Convo — real-time group chat";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const display = await readFile(
    join(process.cwd(), "assets/SpaceGrotesk-Bold.ttf"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 88,
          background: AURORA_CANVAS_DARK,
          // rgba rather than the hex constants: these need an alpha channel, and CSS gradients
          // take no hex-with-opacity here. 124,58,237 IS BRAND_VIOLET and 34,211,238 IS
          // BRAND_CYAN — worth stating, because a grep for the hex will not find these two.
          backgroundImage:
            "radial-gradient(900px 600px at 8% -10%, rgba(124,58,237,0.45), transparent 60%), radial-gradient(700px 500px at 100% 10%, rgba(34,211,238,0.32), transparent 55%)",
          color: AURORA_TEXT_ON_DARK,
          fontFamily: "Space Grotesk",
        }}
      >
        {/*
          The ribbon sweep — the same language as the in-app illustrations, at poster scale.
          Deliberately confined to the lower band: the headline occupies the upper-left, and thin
          strokes crossing 82px type would cost legibility for no gain.
        */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="og-ribbon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={BRAND_VIOLET} />
              <stop offset="50%" stopColor={BRAND_INDIGO} />
              <stop offset="100%" stopColor={BRAND_CYAN} />
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#og-ribbon)" strokeLinecap="round">
            <path
              d="M -60 600 C 220 520, 460 660, 720 566 S 1060 452, 1260 502"
              strokeWidth="5"
              opacity="0.9"
            />
            <path
              d="M -60 636 C 220 556, 460 696, 720 602 S 1060 488, 1260 538"
              strokeWidth="3.5"
              opacity="0.6"
            />
            <path
              d="M -60 672 C 220 592, 460 732, 720 638 S 1060 524, 1260 574"
              strokeWidth="2.5"
              opacity="0.4"
            />
          </g>
        </svg>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 20,
              background: BRAND_CHIP_GRADIENT,
            }}
          >
            {/* the Convo mark — geometry mirrors brand-mark.tsx, scaled to the 32-unit grid */}
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
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
          <div style={{ display: "flex", fontSize: 46 }}>Convo</div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 82,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 900,
          }}
        >
          {SITE_TAGLINE}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            color: AURORA_MUTED_ON_DARK,
          }}
        >
          Real-time group chat — NestJS · Postgres · Socket.IO · Next.js
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Space Grotesk", data: display, style: "normal", weight: 700 },
      ],
    },
  );
}
