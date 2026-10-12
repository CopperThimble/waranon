// Illustrative diagrams for the unit editor. Turret *positions* come from the 3D model's bones
// and aren't in the data, so markers are placed generically; the arcs, angles and trajectories
// are drawn from the real values.

import { COLORS, flightTime } from "../lib/diagrams";

const DEG = Math.PI / 180;

// ── Silhouettes (vehicle faces up in top view, right in side view) ──────────

function TopSilhouette({ type }) {
  switch (type) {
    case "tank":
      return (
        <g className="sil">
          <rect x="74" y="26" width="10" height="68" rx="3" className="sil-dark" />
          <rect x="116" y="26" width="10" height="68" rx="3" className="sil-dark" />
          <rect x="82" y="22" width="36" height="76" rx="5" />
        </g>
      );
    case "plane":
      return (
        <g className="sil">
          <path d="M100 12 L106 34 L106 50 L150 66 L150 72 L106 66 L105 92 L118 102 L118 106 L100 102 L82 106 L82 102 L95 92 L94 66 L50 72 L50 66 L94 50 L94 34 Z" />
        </g>
      );
    case "heli":
      return (
        <g className="sil">
          <circle cx="100" cy="52" r="44" className="sil-rotor" />
          <ellipse cx="100" cy="52" rx="13" ry="24" />
          <rect x="97" y="72" width="6" height="36" rx="2" />
          <rect x="90" y="104" width="20" height="4" rx="2" />
        </g>
      );
    case "infantry":
      return (
        <g className="sil">
          {[[100, 40], [84, 58], [116, 58], [92, 78], [108, 78]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" />
          ))}
        </g>
      );
    case "gun":
      return (
        <g className="sil">
          <rect x="90" y="52" width="20" height="18" rx="3" />
          <path d="M92 70 L78 104 M108 70 L122 104" className="sil-stroke" />
          <circle cx="84" cy="60" r="6" className="sil-dark" />
          <circle cx="116" cy="60" r="6" className="sil-dark" />
        </g>
      );
    default:
      return (
        <g className="sil">
          <rect x="84" y="22" width="32" height="22" rx="4" />
          <rect x="82" y="46" width="36" height="52" rx="3" />
        </g>
      );
  }
}

function SideSilhouette({ type }) {
  switch (type) {
    case "tank":
      return (
        <g className="sil">
          <path d="M30 78 L170 78 L162 96 L38 96 Z" className="sil-dark" />
          <path d="M34 66 L166 66 L172 78 L28 78 Z" />
          <path d="M70 52 L128 52 L136 66 L64 66 Z" />
        </g>
      );
    case "plane":
      return (
        <g className="sil">
          <path d="M20 66 L60 60 L150 58 L178 64 L150 70 L60 72 Z" />
          <path d="M34 62 L26 40 L40 40 L56 61 Z" />
        </g>
      );
    case "heli":
      return (
        <g className="sil">
          <rect x="40" y="42" width="120" height="3" rx="1" className="sil-dark" />
          <path d="M64 56 L140 56 L150 72 L130 80 L72 80 Z" />
          <path d="M70 62 L20 60 L20 66 L70 70 Z" />
          <path d="M80 86 L140 86" className="sil-stroke" />
        </g>
      );
    case "infantry":
      return (
        <g className="sil">
          {[80, 100, 120].map((x) => (
            <g key={x}>
              <circle cx={x} cy="58" r="5" />
              <path d={`M${x - 4} 64 L${x + 4} 64 L${x + 3} 82 L${x + 5} 96 L${x + 1} 96 L${x} 84 L${x - 1} 96 L${x - 5} 96 L${x - 3} 82 Z`} />
            </g>
          ))}
        </g>
      );
    case "gun":
      return (
        <g className="sil">
          <path d="M60 80 L130 80 L120 70 L76 70 Z" />
          <circle cx="96" cy="88" r="9" className="sil-dark" />
          <path d="M60 80 L30 96" className="sil-stroke" />
        </g>
      );
    default:
      return (
        <g className="sil">
          <path d="M36 62 L126 62 L126 86 L36 86 Z" />
          <path d="M128 66 L156 66 L166 78 L166 86 L128 86 Z" />
          <circle cx="58" cy="90" r="8" className="sil-dark" />
          <circle cx="146" cy="90" r="8" className="sil-dark" />
        </g>
      );
  }
}

// Generic turret mount points per silhouette (illustrative only)
const MOUNTS = {
  tank: { top: [[100, 54], [92, 46], [108, 46], [100, 30], [100, 78]], side: [[100, 56], [86, 50], [114, 50], [140, 64], [60, 64]] },
  plane: { top: [[100, 40], [72, 68], [128, 68], [100, 80], [100, 60]], side: [[110, 64], [90, 68], [130, 66], [70, 66], [150, 62]] },
  heli: { top: [[100, 34], [86, 56], [114, 56], [100, 70], [100, 48]], side: [[146, 74], [110, 82], [124, 82], [96, 82], [80, 76]] },
  infantry: { top: [[100, 40], [84, 58], [116, 58], [92, 78], [108, 78]], side: [[100, 70], [80, 70], [120, 70], [90, 70], [110, 70]] },
  gun: { top: [[100, 56], [92, 60], [108, 60], [100, 64], [100, 50]], side: [[104, 72], [96, 72], [110, 72], [90, 72], [116, 72]] },
  truck: { top: [[100, 60], [100, 30], [92, 74], [108, 74], [100, 88]], side: [[90, 58], [140, 62], [70, 58], [110, 58], [56, 58]] },
};

function wedge(cx, cy, r, from, to) {
  // angles in radians, 0 = up (top view) handled by caller
  const span = to - from;
  if (span >= 2 * Math.PI - 1e-6) return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/**
 * turrets: [{ facing°, traverse° (half-arc), elevation°, depression° (positive = below horizon), label }]
 * highlight: index of the turret being edited
 */
export function TurretArcs({ type, turrets, highlight }) {
  const mounts = MOUNTS[type] || MOUNTS.truck;
  return (
    <div className="arcs">
      <figure>
        <svg viewBox="0 0 200 120" role="img" aria-label="Top view: horizontal firing arcs">
          <TopSilhouette type={type} />
          {turrets.map((t, i) => {
            if (t.traverse == null) return null;
            const [cx, cy] = mounts.top[i % mounts.top.length];
            // top view: forward = up (-90° in SVG terms); positive facing turns left (counter-clockwise)
            const center = -90 * DEG - (t.facing || 0) * DEG;
            const half = Math.min(t.traverse, 180) * DEG;
            const full = t.traverse >= 180;
            const r = 40 - i * 4;
            return (
              <g key={i} className={highlight == null || highlight === i ? "" : "arc-dim"}>
                {full ? (
                  // unlimited traverse: a ring, so several 360° turrets don't stack into a blob
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS[i % COLORS.length]} className="arc-ring" />
                ) : (
                  <path d={wedge(cx, cy, r, center - half, center + half)} fill={COLORS[i % COLORS.length]} className="arc-fill" />
                )}
                <line x1={cx} y1={cy} x2={cx + r * Math.cos(center)} y2={cy + r * Math.sin(center)} stroke={COLORS[i % COLORS.length]} className="arc-axis" />
                <circle cx={cx} cy={cy} r="3.2" fill={COLORS[i % COLORS.length]} className="arc-mount" />
              </g>
            );
          })}
        </svg>
        <figcaption>Top: traverse</figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 200 120" role="img" aria-label="Side view: elevation and depression">
          <line x1="0" y1="96.5" x2="200" y2="96.5" className="ground" />
          <SideSilhouette type={type} />
          {turrets.map((t, i) => {
            if (t.elevation == null) return null;
            const [cx, cy] = mounts.side[i % mounts.side.length];
            // side view: forward = right; up = negative y
            const up = -t.elevation * DEG;
            const down = (t.depression || 0) * DEG;
            const r = 46 - i * 5;
            return (
              <g key={i} className={highlight == null || highlight === i ? "" : "arc-dim"}>
                <path d={wedge(cx, cy, r, up, down)} fill={COLORS[i % COLORS.length]} className="arc-fill" />
                <circle cx={cx} cy={cy} r="3.2" fill={COLORS[i % COLORS.length]} className="arc-mount" />
              </g>
            );
          })}
        </svg>
        <figcaption>Side: elevation / depression</figcaption>
      </figure>
    </div>
  );
}

// ── Trajectory ───────────────────────────────────────────────────────────────

function arcPath(range, angleDeg, scale, x0, y0) {
  const tan = Math.tan(angleDeg * DEG);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const x = (range * i) / 40;
    const y = x * tan * (1 - x / range);
    pts.push(`${(x0 + x * scale).toFixed(1)} ${(y0 - y * scale).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

export function TrajectoryChart({ angle, baseAngle, rangeMax, rangeMin, speed, baseSpeed }) {
  const W = 320;
  const H = 130;
  const pad = 14;
  const apex = (r, a) => (r * Math.tan(a * DEG)) / 4;
  const maxApex = Math.max(apex(rangeMax, angle), apex(rangeMax, baseAngle), 1);
  const scale = Math.min((W - 2 * pad) / rangeMax, (H - 2 * pad) / maxApex);
  const x0 = pad;
  const y0 = H - pad;
  const t = flightTime(rangeMax, angle, speed);
  const tBase = flightTime(rangeMax, baseAngle, baseSpeed);
  return (
    <figure className="trajectory">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Projectile arc">
        <line x1="0" y1={y0 + 0.5} x2={W} y2={y0 + 0.5} className="ground" />
        {angle !== baseAngle && <path d={arcPath(rangeMax, baseAngle, scale, x0, y0)} className="traj traj-base" />}
        {rangeMin > 0 && <path d={arcPath(rangeMin, angle, scale, x0, y0)} className="traj traj-min" />}
        <path d={arcPath(rangeMax, angle, scale, x0, y0)} className="traj" />
        <circle cx={x0} cy={y0} r="3" className="traj-gun" />
        <circle cx={x0 + rangeMax * scale} cy={y0} r="3" className="traj-target" />
      </svg>
      <figcaption>
        <span>
          <strong>{angle}°</strong> launch · apex ≈ {Math.round(apex(rangeMax, angle))} GRU at max range
        </span>
        {t != null && (
          <span>
            flight ≈ {t.toFixed(1)}s{tBase != null && Math.abs(t - tBase) > 0.05 && <span className="muted"> (base {tBase.toFixed(1)}s)</span>}
          </span>
        )}
      </figcaption>
      <p className="muted small">
        Solid: max range{rangeMin > 0 ? "; faint: minimum range" : ""}; dashed: original. Higher arcs clear obstacles and drop steeply onto targets but
        stay in the air longer. Flight time is an estimate (path length ÷ projectile speed).
      </p>
    </figure>
  );
}

// ── Infantry squad ───────────────────────────────────────────────────────────

export function SquadFigures({ count, baseCount }) {
  const n = Math.max(0, Math.min(count, 30));
  return (
    <div className="squad-figures" aria-label={`${count} soldiers`}>
      {Array.from({ length: n }, (_, i) => (
        <svg key={i} viewBox="0 0 12 24" className={i >= baseCount ? "soldier soldier-new" : "soldier"}>
          <circle cx="6" cy="4" r="3" />
          <path d="M2.5 8 L9.5 8 L9 16 L10 23 L7.5 23 L6 17 L4.5 23 L2 23 L3 16 Z" />
        </svg>
      ))}
      {count > 30 && <span className="muted small">+{count - 30}</span>}
    </div>
  );
}
