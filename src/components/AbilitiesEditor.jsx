import { VANILLA_ABILITIES, describeCustomAbility, describePreset, presetActive, presetActiveOnBase } from "../lib/abilities";
import { useProject } from "../state/useProject";

function prune(abilities) {
  const presets = Object.fromEntries(Object.entries(abilities.presets || {}).filter(([, v]) => v !== undefined));
  const custom = abilities.custom || [];
  if (!Object.keys(presets).length && !custom.length) return undefined;
  return { presets, custom };
}

export default function AbilitiesEditor({ unit, base, set }) {
  const { game, project } = useProject();
  const current = unit.abilities || {};

  function togglePreset(p) {
    const on = !presetActive(p, unit, base);
    const presets = { ...current.presets, [p.id]: on === presetActiveOnBase(p, base) ? undefined : on };
    set({ abilities: prune({ ...current, presets }) });
  }
  function toggleCustom(id) {
    const list = current.custom || [];
    const custom = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    set({ abilities: prune({ ...current, custom }) });
  }

  const hasSmoke = base.specialties.includes("_smoke_launcher");

  return (
    <div className="tab-body">
      <h3 className="section-title">Vanilla abilities</h3>
      <p className="muted small">These reuse the game's own ability definitions and icons. "base" marks what the original unit has.</p>
      <div className="ability-grid">
        {VANILLA_ABILITIES.map((p) => {
          const on = presetActive(p, unit, base);
          const onBase = presetActiveOnBase(p, base);
          return (
            <button
              type="button"
              key={p.id}
              className={`ability ${on ? "ability-on" : ""} ${on !== onBase ? "ability-changed" : ""}`}
              onClick={() => togglePreset(p)}
              aria-pressed={on}
            >
              <span className="ability-head">
                <span className="switch" aria-hidden="true" />
                <strong>{p.label}</strong>
                {onBase && <span className="ability-base">base</span>}
              </span>
              <span className="ability-desc">{describePreset(p, game)}</span>
            </button>
          );
        })}
        {hasSmoke && (
          <div className="ability ability-on ability-readonly">
            <span className="ability-head">
              <strong>Smoke launchers</strong>
              <span className="ability-base">base</span>
            </span>
            <span className="ability-desc">
              Not an ability: it's a smoke weapon in the loadout plus a "deploy smoke" order. Adjust its ammo on the Weapons tab.
            </span>
          </div>
        )}
      </div>

      <h3 className="section-title">Custom abilities</h3>
      {(project.abilities || []).length ? (
        <div className="ability-grid">
          {project.abilities.map((a) => {
            const on = (current.custom || []).includes(a.id);
            return (
              <button
                type="button"
                key={a.id}
                className={`ability ${on ? "ability-on ability-changed" : ""}`}
                onClick={() => toggleCustom(a.id)}
                aria-pressed={on}
              >
                <span className="ability-head">
                  <span className="switch" aria-hidden="true" />
                  <strong>{a.name}</strong>
                  <span className="tag-custom">custom</span>
                </span>
                <span className="ability-desc">{describeCustomAbility(a)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted small">No custom abilities yet.</p>
      )}
      <button type="button" className="link small" onClick={() => window.location.assign("#/abilities")}>
        Create or edit custom abilities →
      </button>
    </div>
  );
}
