import warpWordmarkWhite from "../brand/warp-wordmark-white.svg";
import warpWordmarkBlack from "../brand/warp-wordmark-black.svg";

/**
 * Icon-only Warp glyph (the arc mark, no wordmark). Inlined so it inherits the
 * current text color via `currentColor` — lets it adapt to the projector's
 * light/dark phases with a Tailwind text color class.
 */
export function WarpMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 433 347"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path d="M221.462 0H384.793C411.231 0 432.665 22.1478 432.665 49.4686V241.522C432.665 268.843 411.231 290.991 384.793 290.991H151.061L221.462 0Z" />
      <path d="M179.038 55.128H47.4647C21.2507 55.128 0 77.2758 0 104.596V296.65C0 323.972 21.2507 346.119 47.4647 346.119H209.403L215.897 319.047H115.731L179.038 55.128Z" />
    </svg>
  );
}

/** Full Warp wordmark (icon + lettering) as an image. */
export function WarpWordmark({
  variant = "white",
  className,
}: {
  variant?: "white" | "black";
  className?: string;
}) {
  return (
    <img
      src={variant === "black" ? warpWordmarkBlack : warpWordmarkWhite}
      alt="Warp"
      className={className}
    />
  );
}

/** "Powered by Warp" lockup for billboard surfaces (idle / game over). */
export function PoweredByWarp({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ""}`}>
      <span className="text-xs uppercase tracking-[0.35em] text-white/50">
        Powered by
      </span>
      <WarpWordmark variant="white" className="h-7 w-auto opacity-80" />
    </div>
  );
}

/** Inline "Powered by Oz agents" lockup with the Warp mark. Inherits the
 * current text color, so it adapts to the projector's light/dark phases. */
export function PoweredByOz({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <WarpMark className="h-4 w-auto shrink-0" />
      <span className="text-xs uppercase tracking-wider">
        Powered by Oz agents
      </span>
    </div>
  );
}

/** Inline attribution crediting the Warp judge agent. */
export function JudgedByWarp({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 text-black/50 ${className ?? ""}`}
    >
      <WarpMark className="h-4 w-auto" />
      <span className="text-xs uppercase tracking-wider">
        Judged by a Warp agent
      </span>
    </div>
  );
}
