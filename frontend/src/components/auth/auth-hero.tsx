import { AuroraRibbons } from "@/components/ui/aurora-ribbons";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";

/**
 * The signature. An auth page's job is to invite you in — so it opens with the most
 * characteristic thing in a chat app: a conversation. A still vignette (not the live app),
 * warm and unhurried, showing what the product feels like before you've signed in.
 */

const SAMPLE = [
  {
    name: "Qodeon Labs CTO",
    text: "Into your third week — how's it going so far?",
    own: false,
  },
  {
    name: "Intern",
    text: "Better each week — it's finally all connecting",
    own: true,
  },
];

export function AuthHero() {
  return (
    <div className="relative hidden overflow-hidden bg-surface-2 lg:flex lg:flex-col lg:justify-between lg:gap-8 lg:p-10">
      {/* soft warm glow, top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/20 blur-3xl"
      />

      {/* ribbon field — the same primitive as the empty states, at hero scale */}
      {/*
        `slice` (scale-to-cover, crop the overflow) rather than `none`: stretching the 200x140
        viewBox to the panel would scale x and y by different factors, which distorts the stroke
        widths and smears the bands. Cropping keeps them crisp.
      */}
      <svg
        aria-hidden
        viewBox="0 0 200 140"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-45"
      >
        <AuroraRibbons id="hero" bands={6} />
      </svg>

      {/* `relative` so the mark paints above the absolutely-positioned ribbon layer above it */}
      <div className="relative">
        <Logo size="lg" />
      </div>

      <div className="relative flex flex-col gap-7">
        <h1 className="max-w-md font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-ink">
          Where your group actually talks.
        </h1>

        <div className="flex flex-col gap-2.5">
          {SAMPLE.map((m, i) => (
            <div
              key={i}
              className={`flex items-end gap-2.5 ${m.own ? "flex-row-reverse" : ""}`}
            >
              {!m.own && <Avatar name={m.name} size={32} />}
              <div
                className={`flex max-w-xs flex-col gap-0.5 ${m.own ? "items-end" : "items-start"}`}
              >
                <span className="px-1 font-mono text-[11px] uppercase tracking-wide text-muted">
                  {m.name}
                </span>
                <span
                  className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    m.own
                      ? "rounded-br-md bg-brand text-on-brand"
                      : "rounded-bl-md bg-surface text-ink"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="relative max-w-sm text-sm text-muted">
        Create a group, share the link, and pick up the conversation whenever you drop in.
      </p>
    </div>
  );
}
