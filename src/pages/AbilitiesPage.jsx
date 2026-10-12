import { useMemo, useState } from "react";
import { Button, Empty, Field, ImageUpload, PageHeader } from "../components/ui";
import {
  ABILITY_MODES,
  EFFECTS,
  EFFECTS_BY_KEY,
  TARGET_PRESETS,
  describeCustomAbility,
  formatEffectValue,
} from "../lib/abilities";
import { IMAGE_SPECS } from "../lib/images";
import { newAbility } from "../lib/model";
import { useProject } from "../state/useProject";

export default function AbilitiesPage({ route }) {
  const { project, addItem } = useProject();
  const abilities = project.abilities || [];
  const [selectedId, setSelectedId] = useState(() => (route?.id && abilities.some((x) => x.id === route.id) ? route.id : abilities[0]?.id || null));
  const selected = abilities.find((a) => a.id === selectedId) || abilities[0];

  function create() {
    const a = newAbility();
    addItem("abilities", a);
    setSelectedId(a.id);
  }

  return (
    <div className="page">
      <PageHeader
        title="Abilities"
        subtitle="Build special abilities from the same effect building blocks the game uses for Shock troops, Resolute, Military Police and so on. Give them to units on each unit's Abilities tab."
        actions={<Button variant="primary" onClick={create}>+ New ability</Button>}
      />
      {!abilities.length ? (
        <Empty icon="✦" title="No custom abilities yet" action={<Button variant="primary" onClick={create}>Create an ability</Button>}>
          An ability is a set of effects (for example −20% suppression taken, +10 accuracy) applied to the unit itself, to nearby friendly units, or
          to nearby enemies.
        </Empty>
      ) : (
        <div className="md-layout">
          <aside className="md-list">
            {abilities.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`md-item ${a.id === selected?.id ? "active" : ""}`}
                onClick={() => setSelectedId(a.id)}
              >
                <span className="ability-glyph">✦</span>
                <span className="md-item-text">
                  <span className="md-item-title">{a.name || "Unnamed"}</span>
                  <span className="md-item-sub">{ABILITY_MODES.find((m) => m.id === a.mode)?.label}</span>
                </span>
              </button>
            ))}
          </aside>
          {selected && <AbilityEditor key={selected.id} ability={selected} />}
        </div>
      )}
    </div>
  );
}

function AbilityEditor({ ability: a }) {
  const { game, project, patchItem, removeItem, addAsset, removeAsset } = useProject();
  const set = (patch) => patchItem("abilities", a.id, patch);
  const users = project.units.filter((u) => u.abilities?.custom?.includes(a.id));
  const iconChoices = useMemo(
    () => [...new Set(Object.values(game.specialtyIcons))].sort((x, y) => x.localeCompare(y)),
    [game],
  );

  const setEffect = (i, patch) => set({ effects: a.effects.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const unusedEffects = EFFECTS.filter((e) => !a.effects.some((x) => x.key === e.key));

  return (
    <section className="md-detail card">
      <div className="detail-head">
        <span className="ability-glyph ability-glyph-lg">✦</span>
        <div className="grow">
          <input className="input title-input" value={a.name} onChange={(e) => set({ name: e.target.value })} aria-label="Ability name" />
          <div className="muted small">{describeCustomAbility(a)}</div>
        </div>
      </div>

      <Field label="Tooltip text" hint="Shown when hovering the ability icon in game.">
        {(id) => (
          <textarea
            id={id}
            className="input"
            rows={2}
            value={a.description}
            placeholder="e.g. Veteran officers steady nearby troops."
            onChange={(e) => set({ description: e.target.value })}
          />
        )}
      </Field>

      <h3 className="section-title">Who it affects</h3>
      <div className="mode-grid">
        {ABILITY_MODES.map((m) => (
          <button type="button" key={m.id} className={`mode ${a.mode === m.id ? "mode-on" : ""}`} onClick={() => set({ mode: m.id })}>
            <strong>{m.label}</strong>
            <span>{m.hint}</span>
          </button>
        ))}
      </div>

      {a.mode !== "self" && (
        <div className="form-grid ability-targeting">
          <Field label={`Range: ${a.range} GRU`} hint="Vanilla: Shock 350, Military Police 500, instructors 450, electronic warfare 3887.">
            {(id) => (
              <input id={id} type="range" min={50} max={5000} step={25} value={a.range} onChange={(e) => set({ range: Number(e.target.value) })} />
            )}
          </Field>
          <Field label={a.mode === "proximity" ? "Triggered by enemy" : "Affects"}>
            {(id) => (
              <select id={id} className="input" value={a.targets} onChange={(e) => set({ targets: e.target.value })}>
                {TARGET_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {a.mode === "aura" && (
            <label className="check check-field">
              <input type="checkbox" checked={a.includeSelf} onChange={(e) => set({ includeSelf: e.target.checked })} />
              Also affects the unit itself
            </label>
          )}
        </div>
      )}

      <h3 className="section-title">Effects</h3>
      <div className="effects">
        {a.effects.map((e, i) => {
          const def = EFFECTS_BY_KEY[e.key];
          return (
            <div key={i} className="effect">
              <select
                className="input"
                value={e.key}
                onChange={(ev) => setEffect(i, { key: ev.target.value, value: EFFECTS_BY_KEY[ev.target.value].default })}
              >
                {[def, ...unusedEffects].filter(Boolean).map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={e.value}
                onChange={(ev) => setEffect(i, { value: Number(ev.target.value) })}
                aria-label={`${def.label} value`}
              />
              <input
                type="number"
                className="input effect-number"
                step={def.step}
                value={e.value}
                onChange={(ev) => ev.target.value !== "" && setEffect(i, { value: Number(ev.target.value) })}
              />
              <span className={`effect-preview ${isGood(def, e.value) ? "good" : "bad"}`}>{formatEffectValue(def.style, e.value, def.unit)}</span>
              <button type="button" className="icon-btn" onClick={() => set({ effects: a.effects.filter((_, j) => j !== i) })} aria-label="Remove effect">
                ✕
              </button>
            </div>
          );
        })}
      </div>
      {unusedEffects.length > 0 && (
        <Button size="sm" onClick={() => set({ effects: [...a.effects, { key: unusedEffects[0].key, value: unusedEffects[0].default }] })}>
          + Add effect
        </Button>
      )}
      <p className="muted small">
        × values multiply (0.8 = 20% less), % values add a percentage, + values add directly. Green means the effect helps the unit it lands on.
      </p>

      <h3 className="section-title">Icon</h3>
      <div className="flag-row">
        <ImageUpload
          spec={IMAGE_SPECS.abilityIcon}
          blob={project.assets[a.iconAssetId]?.blob}
          fallbackUrl={null}
          onChange={(blob, name) => {
            removeAsset(a.iconAssetId);
            set({ iconAssetId: addAsset(blob, name) });
          }}
          onClear={() => {
            removeAsset(a.iconAssetId);
            set({ iconAssetId: null });
          }}
        />
        <Field label="Or reuse a game icon" hint="Used when no image is uploaded.">
          {(id) => (
            <select id={id} className="input" value={a.iconTexture} onChange={(e) => set({ iconTexture: e.target.value })} disabled={!!a.iconAssetId}>
              {iconChoices.map((t) => (
                <option key={t} value={t}>
                  {t.replace("Texture_Speciality_Icon_", "").replace(/_/g, " ")}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <h3 className="section-title">Units with this ability</h3>
      <p className="muted small">{users.length ? users.map((u) => u.name).join(", ") : "None yet. Turn it on from a unit's Abilities tab."}</p>

      <div className="detail-footer">
        <span />
        <Button
          variant="ghost-danger"
          onClick={() => {
            if (window.confirm(`Delete ${a.name}?${users.length ? ` It will be removed from ${users.length} unit(s).` : ""}`)) {
              removeAsset(a.iconAssetId);
              removeItem("abilities", a.id);
            }
          }}
        >
          Delete ability
        </Button>
      </div>
    </section>
  );
}

function isGood(def, value) {
  const v = Number(value);
  if (def.good === "negative") return v < 0;
  if (def.good === "low") return v < 1;
  if (def.style === "mult") return v > 1;
  return v > 0;
}
