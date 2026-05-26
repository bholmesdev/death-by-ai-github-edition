import { useMemo } from "react";

type SpiralProps = {
  /** Background color filled behind the spiral. */
  background?: string;
  /** Color of the spiral arms (use rgba for translucency). */
  arm?: string;
  /** Arms drawn around the center. 2 = pinwheel. */
  arms?: number;
  /** Spiral arm thickness in viewBox units. */
  thickness?: number;
  /** Speed in seconds for one full rotation. 0 = no animation. */
  spinSeconds?: number;
  className?: string;
};

const SIZE = 1000;
const CENTER = SIZE / 2;

function buildArchimedean() {
  const a = 30;
  const b = 38;
  const turns = 4;
  const steps = 720;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI;
    const r = a + b * t;
    const x = CENTER + r * Math.cos(t);
    const y = CENTER + r * Math.sin(t);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return d;
}

export function Spiral({
  background = "var(--color-dba-purple-500)",
  arm = "rgba(0, 0, 0, 0.18)",
  arms = 2,
  thickness = 110,
  spinSeconds = 80,
  className = "",
}: SpiralProps) {
  const path = useMemo(buildArchimedean, []);
  const armList = Array.from({ length: arms }, (_, i) => (360 / arms) * i);
  const animationStyle =
    spinSeconds > 0
      ? { animation: `dba-spin ${spinSeconds}s linear infinite` }
      : undefined;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ backgroundColor: background }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: "180vmax",
          height: "180vmax",
          transform: "translate(-50%, -50%)",
          ...animationStyle,
        }}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-full w-full">
          <g>
            {armList.map((rotation) => (
              <path
                key={rotation}
                d={path}
                fill="none"
                stroke={arm}
                strokeWidth={thickness}
                strokeLinecap="round"
                transform={`rotate(${rotation} ${CENTER} ${CENTER})`}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
