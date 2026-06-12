/**
 * Floodlight loading overlay — pulsating Whitey's crest.
 * Shown briefly on first load and between route changes.
 */
export default function Loader({ label = "Whitey’s World Cup Sweepstake" }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 42%, rgba(22,48,31,0.96), rgba(8,16,9,0.99))",
        backdropFilter: "blur(6px)",
        animation: "loaderVeil 0.18s ease both",
      }}
    >
      <div
        className="relative flex h-[270px] w-[270px] items-center justify-center"
        style={{ animation: "loaderRise 0.3s ease both" }}
      >
        <span
          className="absolute h-[250px] w-[250px] rounded-full border border-gold"
          style={{ animation: "crestRing 1.7s ease-out infinite" }}
        />
        <span
          className="absolute h-[250px] w-[250px] rounded-full border border-gold"
          style={{ animation: "crestRing2 1.7s ease-out infinite 0.25s" }}
        />
        <img
          src="/whiteys-crest.png"
          alt=""
          className="h-[252px] w-[252px] object-contain"
          style={{ animation: "crestPulse 1.7s ease-in-out infinite" }}
        />
      </div>
      <div
        className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[3px] text-gold"
        style={{ animation: "loaderRise 0.3s ease both 0.05s" }}
      >
        <span>{label}</span>
        <span className="inline-flex gap-1">
          <span className="h-1 w-1 rounded-full bg-gold" style={{ animation: "loadDots 1.2s infinite 0s" }} />
          <span className="h-1 w-1 rounded-full bg-gold" style={{ animation: "loadDots 1.2s infinite 0.2s" }} />
          <span className="h-1 w-1 rounded-full bg-gold" style={{ animation: "loadDots 1.2s infinite 0.4s" }} />
        </span>
      </div>
    </div>
  );
}
