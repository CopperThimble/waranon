// Helpers for the unit-editor diagrams (kept out of the component file for fast refresh).

const DEG = Math.PI / 180;

export const COLORS = ["#d9a441", "#4f8ff7", "#4cc38a", "#e5484d", "#b07cf0", "#38bdf8"];
export const turretColor = (i) => COLORS[i % COLORS.length];

/** Which silhouette to draw for a vanilla unit. */
export function silhouetteType(base) {
  if (base.stats.turnRadius != null) return "plane";
  if (base.stats.climb != null) return "heli";
  if (base.stats.soldiers != null) return "infantry";
  if (base.movingType === "Track" || base.movingType === "TrackAmphibious") return "tank";
  if (base.factory === "Art" && (base.movingType === "Infantry" || !base.movingType)) return "gun";
  return "truck";
}

/** Approximate time of flight: arc length / projectile speed (the engine's exact ballistics aren't documented). */
export function flightTime(range, angleDeg, speed) {
  if (!speed) return null;
  const tan = Math.tan(angleDeg * DEG);
  let len = 0;
  let prev = [0, 0];
  for (let i = 1; i <= 100; i++) {
    const x = (range * i) / 100;
    const y = x * tan * (1 - x / range);
    len += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
  }
  return len / speed;
}

