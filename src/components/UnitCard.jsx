import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROLE_LABELS } from "../lib/labels";
import { traitIconUrl, vanillaWeaponUrl } from "../lib/images";
import { CATEGORIES, titleCase } from "../lib/model";
import { cardWeapons, statScale } from "../lib/unitCard";
import { useProject } from "../state/useProject";
import { useVanillaAssessments } from "../state/useCostModel";
import { DlcBadge, NationFlag, SpecIcon, UnitSpecIcons } from "./visuals";

const ARMOR_LABELS = {
  ResistanceFamily_blindage: null,
  ResistanceFamily_infanterie: "Infantry",
  ResistanceFamily_vehicule_leger: "Light",
  ResistanceFamily_helico: "Heli",
  ResistanceFamily_avion: "Aircraft",
};

function Bar({ value, max, children, tone }) {
  const pct = max ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`uc-bar ${tone ? `uc-${tone}` : ""}`}>
      <span className="uc-track">
        <span className="uc-bar-fill" style={{ width: value ? `${pct}%` : 0 }} />
      </span>
      <span className="uc-bar-value">{children ?? value}</span>
    </div>
  );
}

const fmtRange = (v) => (v > 0 ? `${Math.round(v).toLocaleString()} m` : "–");
const accuracyTone = (a) => (a >= 50 ? "good" : a >= 25 ? "mid" : "low");

/**
 * In-game style armory card: header, armor, then one column per weapon with penetration,
 * ranges, damage and shooting stats. `unit` (custom unit) applies the user's edits on top of `base`.
 */
export function UnitCard({ base, unit = null, name }) {
  const { game } = useProject();
  const assessments = useVanillaAssessments(game);
  const stats = { ...base.stats, ...(unit?.stats || {}) };
  const weapons = cardWeapons(game, base, unit);
  const scale = statScale(game);
  const armorLabel = ARMOR_LABELS[base.armorFamily];
  const a = !unit && assessments?.get(base.id);

  return (
    <div className="unit-card">
      <header className="uc-head">
        <span className="uc-cost">
          <NationFlag tag={unit?.nationTag || base.country} size={20} /> <strong>{stats.cp ?? "–"}</strong>
        </span>
        <h3>{name || unit?.name || titleCase(base.name)}</h3>
        <DlcBadge packs={!unit && base.dlc} />
      </header>
      <div className="uc-row2">
        <div>
          <span className="uc-label">Unit category</span>
          <span className="uc-role">
            <SpecIcon spec={base.role} size={20} /> {ROLE_LABELS[base.role] || base.role} · {CATEGORIES.find((c) => c.id === base.factory)?.label}
          </span>
        </div>
        <div>
          <span className="uc-label">{a ? "Value for points" : "Traits"}</span>
          {a ? (
            <span className={`verdict verdict-${a.verdict}`}>
              {{ underpriced: "Bargain", overpriced: "Overpriced", fair: "Fair" }[a.verdict]} (~{a.suggested} pts)
            </span>
          ) : (
            <UnitSpecIcons unit={base} size={18} />
          )}
        </div>
      </div>
      {a && base.specialties.length > 0 && (
        <div className="uc-traits">
          <UnitSpecIcons unit={base} size={18} />
        </div>
      )}

      <div className="uc-section">Armor</div>
      <div className="uc-grid uc-grid-4">
        {["Front", "Sides", "Rear", "Top"].map((s) => (
          <div key={s} className="uc-cell">
            <span className="uc-label">{s === "Sides" ? "Side" : s}</span>
            {armorLabel ? (
              <Bar value={0} max={1} tone="low">
                {armorLabel}
              </Bar>
            ) : (
              <Bar value={stats[`armor${s}`] || 0} max={25} tone={(stats[`armor${s}`] || 0) <= 1 ? "low" : null} />
            )}
          </div>
        ))}
      </div>
      <div className="uc-grid uc-grid-4 uc-general">
        {stats.health != null && <Stat label={stats.soldiers ? "Soldiers / HP" : "Health"} value={stats.soldiers ? `${stats.soldiers} / ${stats.health}` : stats.health} />}
        {stats.speed != null && <Stat label="Speed" value={`${stats.speed} km/h`} />}
        {stats.optics != null && <Stat label="Optics" value={stats.optics} />}
        {stats.stealth != null && <Stat label="Stealth" value={stats.stealth} />}
        {stats.ecm ? <Stat label="ECM" value={`${Math.round(-stats.ecm * 100)}%`} /> : null}
        {stats.supply ? <Stat label="Supply" value={stats.supply} /> : null}
      </div>

      {weapons.length > 0 ? (
        <div className="uc-weapons" style={{ "--cols": weapons.length }}>
          <div className="uc-section uc-span">Weapons</div>
          {weapons.map((w) => (
            <div key={w.key} className="uc-wcell uc-whead">
              <div className="uc-traits-row">
                {w.traits.map((t) => {
                  const url = traitIconUrl(t.icon);
                  return url ? <img key={t.icon} src={url} alt={t.label} title={t.label} /> : <span key={t.icon} className="uc-trait-text">{t.label}</span>;
                })}
              </div>
              {vanillaWeaponUrl(game.weaponIcons[w.icon]) ? <img className="uc-wimg" src={vanillaWeaponUrl(game.weaponIcons[w.icon])} alt="" /> : <div className="uc-wimg" />}
              <strong>{w.name}</strong>
              <span className="muted small">
                {w.ammoCount ? `${w.ammoCount.toLocaleString()} rounds` : ""}
                {w.count > 1 ? ` · ×${w.count}` : ""}
              </span>
            </div>
          ))}

          <div className="uc-section uc-span">Armor penetration</div>
          {weapons.map((w) => (
            <div key={w.key} className="uc-wcell">
              <span className="uc-label">{w.ap ? "Penetration" : "HE"}</span>
              <Bar value={w.power} max={scale.power} tone={w.ap && w.power >= 18 ? "high" : null} />
            </div>
          ))}

          <div className="uc-section uc-span">Target ranges</div>
          {weapons.map((w) => (
            <div key={w.key} className="uc-wcell uc-stack">
              {w.indirect && w.range > scale.range ? (
                <>
                  <span className="uc-label">Artillery</span>
                  <Bar value={w.range} max={scale.indirect}>
                    {fmtRange(w.range)}
                  </Bar>
                </>
              ) : (
                <>
                  <span className="uc-label">Ground target</span>
                  <Bar value={w.range} max={scale.range}>
                    {fmtRange(w.range)}
                  </Bar>
                </>
              )}
              {w.rangeHeli > 0 && (
                <>
                  <span className="uc-label">Helicopter</span>
                  <Bar value={w.rangeHeli} max={scale.range}>
                    {fmtRange(w.rangeHeli)}
                  </Bar>
                </>
              )}
              {w.rangeAir > 0 && (
                <>
                  <span className="uc-label">Aircraft</span>
                  <Bar value={w.rangeAir} max={scale.rangeAir}>
                    {fmtRange(w.rangeAir)}
                  </Bar>
                </>
              )}
            </div>
          ))}

          <div className="uc-section uc-span">Weapon damage</div>
          {weapons.map((w) => (
            <div key={w.key} className="uc-wcell uc-stack">
              <span className="uc-label">Damage</span>
              <Bar value={w.damage} max={scale.damage} />
              <span className="uc-label">Suppress</span>
              <Bar value={w.suppress} max={scale.suppress} />
            </div>
          ))}

          <div className="uc-section uc-span">Shooting attributes</div>
          {weapons.map((w) => (
            <div key={w.key} className="uc-wcell uc-stack">
              <span className="uc-label">Accuracy {w.accuracyMoving != null && <span className="muted">(moving {w.accuracyMoving}%)</span>}</span>
              <Bar value={w.accuracy} max={100} tone={accuracyTone(w.accuracy)}>
                {w.accuracy}%
              </Bar>
              <span className="uc-label">Rate of fire</span>
              <Bar value={w.rof} max={scale.rof}>
                {w.rof}/min
              </Bar>
              <span className="muted small">
                {w.perSalvo > 1 ? `${w.perSalvo} per salvo · ` : ""}
                {w.reload}s reload{w.aimTime ? ` · ${w.aimTime}s aim` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small uc-noweapons">No weapons.</p>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="uc-cell">
      <span className="uc-label">{label}</span>
      <span className="uc-stat">{value}</span>
    </div>
  );
}

/**
 * Wrap anything that stands for a unit: hovering it (mouse only, after a short delay) shows its
 * card next to it. Pass `base` (vanilla unit) and optionally `unit` (custom unit).
 */
export function UnitHover({ base, unit = null, name, children, className = "", ...rest }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!base) {
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  }
  const enter = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnchor(ref.current?.getBoundingClientRect() || null), 350);
  };
  const leave = () => {
    clearTimeout(timer.current);
    setAnchor(null);
  };
  return (
    <span ref={ref} className={className} onPointerEnter={enter} onPointerLeave={leave} onPointerDown={leave} {...rest}>
      {children}
      {anchor &&
        createPortal(
          <Floating anchor={anchor}>
            <UnitCard base={base} unit={unit} name={name} />
          </Floating>,
          document.body,
        )}
    </span>
  );
}

/** Positions the card beside the anchor rect, flipping/clamping to stay on screen. */
function Floating({ anchor, children }) {
  const ref = useRef(null);
  // measured after render (and again if it resizes), then placed directly (no extra render)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // shrink tall/wide cards to fit the window instead of running off it (offset* ignores the transform)
      const k = Math.min(1, (vh - 16) / el.offsetHeight, (vw - 16) / el.offsetWidth);
      el.style.transform = k < 1 ? `scale(${k})` : "";
      const width = el.offsetWidth * k;
      const height = el.offsetHeight * k;
      const gap = 12;
      let left = anchor.right + gap;
      if (left + width > vw - 8) left = anchor.left - gap - width;
      if (left < 8) left = Math.max(8, Math.min(vw - width - 8, anchor.left));
      let top = anchor.top;
      if (top + height > vh - 8) top = Math.max(8, vh - height - 8);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);
  return (
    <div ref={ref} className="unit-card-float" style={{ left: -9999, top: 0 }} role="tooltip">
      {children}
    </div>
  );
}
