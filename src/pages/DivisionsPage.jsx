import { useMemo, useState } from "react";
import UnitPicker from "../components/UnitPicker";
import { Button, Empty, Field, ImageUpload, PageHeader, SideBadge } from "../components/ui";
import { UnitHover } from "../components/UnitCard";
import { DivisionEmblem, NationFlag, UnitThumb } from "../components/visuals";
import { IMAGE_SPECS, vanillaEmblemUrl } from "../lib/images";
import {
  CATEGORIES,
  DIVISION_TYPE_LABELS,
  allNations,
  defaultRuleFor,
  nationSide,
  newDivision,
  resolveUnitRef,
  titleCase,
} from "../lib/model";
import { useProject } from "../state/useProject";

export default function DivisionsPage({ route }) {
  const { game, project, addItem } = useProject();
  const [selectedId, setSelectedId] = useState(() => (route?.id && project.divisions.some((x) => x.id === route.id) ? route.id : project.divisions[0]?.id || null));
  const selected = project.divisions.find((d) => d.id === selectedId) || project.divisions[0];

  function create() {
    const tag = project.nations.find((n) => n.tag)?.tag || game.countries[0].tag;
    const side = nationSide(game, project, tag);
    const d = newDivision(tag);
    const fallback = game.divisions.find((x) => x.coalition === side) || game.divisions[0];
    d.costMatrix = structuredClone(game.costMatrices[fallback.costMatrix]);
    addItem("divisions", d);
    setSelectedId(d.id);
  }

  return (
    <div className="page">
      <PageHeader
        title="Divisions"
        subtitle="Decks players pick in multiplayer. Start from a vanilla division's roster or from scratch, and mix in your custom units."
        actions={<Button variant="primary" onClick={create}>+ New division</Button>}
      />
      {!project.divisions.length ? (
        <Empty icon="◆" title="No divisions yet" action={<Button variant="primary" onClick={create}>Create a division</Button>}>
          Custom units only become playable once they're in a division.
        </Empty>
      ) : (
        <div className="md-layout">
          <aside className="md-list">
            {project.divisions.map((d) => (
              <button
                type="button"
                key={d.id}
                className={`md-item ${d.id === selected?.id ? "active" : ""}`}
                onClick={() => setSelectedId(d.id)}
              >
                <DivisionEmblem division={d} size={34} />
                <span className="md-item-text">
                  <span className="md-item-title">{d.name || "Unnamed division"}</span>
                  <span className="md-item-sub">
                    <NationFlag tag={d.nationTag} size={14} /> {d.nationTag} · {d.roster.length} units
                  </span>
                </span>
              </button>
            ))}
          </aside>
          {selected && <DivisionEditor key={selected.id} division={selected} />}
        </div>
      )}
    </div>
  );
}

function DivisionEditor({ division: d }) {
  const { game, project, patchItem, removeItem, addAsset, removeAsset } = useProject();
  const [baseChoice, setBaseChoice] = useState(d.baseDivisionId || "");
  const [picker, setPicker] = useState(null); // { mode: 'add', factory } | { mode: 'transport', ref }
  const set = (patch) => patchItem("divisions", d.id, patch);
  const side = nationSide(game, project, d.nationTag);
  const nations = allNations(game, project);

  const resolved = useMemo(
    () => d.roster.map((r) => ({ rule: r, info: resolveUnitRef(game, project, r.unit) })),
    [d.roster, game, project],
  );
  const inRoster = useMemo(() => new Set(d.roster.map((r) => r.unit)), [d.roster]);

  function loadBase() {
    const base = game.divisionsById.get(baseChoice);
    if (!base) return;
    if (d.roster.length && !window.confirm(`Replace the current ${d.roster.length}-unit roster with ${titleCase(base.name)}'s?`)) return;
    set({
      baseDivisionId: base.id,
      roster: game.rules[base.rule].map((r) => structuredClone(r)),
      costMatrix: structuredClone(game.costMatrices[base.costMatrix]),
      activationPoints: base.activationPoints,
      typeToken: base.typeToken,
    });
  }

  const updateRule = (ref, patch) =>
    set({ roster: d.roster.map((r) => (r.unit === ref ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)) });

  const baseOptions = ["NATO", "PACT"].map((s) => ({
    side: s,
    divisions: game.divisions.filter((x) => x.coalition === s),
  }));

  return (
    <section className="md-detail card">
      <div className="detail-head">
        <DivisionEmblem division={d} size={64} />
        <div className="grow">
          <input className="input title-input" value={d.name} onChange={(e) => set({ name: e.target.value })} aria-label="Division name" />
          <div className="row gap-sm">
            <SideBadge side={side} />
            <span className="muted small">
              {d.roster.length} units · {d.activationPoints} activation points · {DIVISION_TYPE_LABELS[d.typeToken] || d.typeToken}
            </span>
          </div>
        </div>
      </div>

      <div className="base-bar">
        <Field label="Start from a vanilla division" className="grow">
          {(id) => (
            <select id={id} className="input" value={baseChoice} onChange={(e) => setBaseChoice(e.target.value)}>
              <option value="">Choose…</option>
              {baseOptions.map((g) => (
                <optgroup key={g.side} label={g.side}>
                  {g.divisions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {titleCase(x.name)} ({x.country}){x.dlc ? ` · DLC: ${x.dlc.name}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <Button onClick={loadBase} disabled={!baseChoice}>Copy roster &amp; costs</Button>
      </div>

      <div className="division-top">
        <div className="form-grid">
          <Field label="Nation">
            {(id) => (
              <select id={id} className="input" value={d.nationTag} onChange={(e) => set({ nationTag: e.target.value })}>
                {nations.map((n) => (
                  <option key={n.tag} value={n.tag}>
                    {n.name} ({n.tag}){n.custom ? " ★" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Type">
            {(id) => (
              <select id={id} className="input" value={d.typeToken} onChange={(e) => set({ typeToken: e.target.value })}>
                {game.divisionTypes.map((t) => (
                  <option key={t} value={t}>
                    {DIVISION_TYPE_LABELS[t] || t}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Activation points" hint="Deck budget. Vanilla multiplayer uses 50.">
            {(id) => (
              <input id={id} type="number" min={1} className="input" value={d.activationPoints} onChange={(e) => set({ activationPoints: Number(e.target.value) })} />
            )}
          </Field>
          <Field label="Summary" className="span-2">
            {(id) => <input id={id} className="input" value={d.summary} placeholder="One line shown in the division list" onChange={(e) => set({ summary: e.target.value })} />}
          </Field>
          <Field label="History" className="span-2">
            {(id) => <textarea id={id} className="input" rows={3} value={d.history} placeholder="Background text" onChange={(e) => set({ history: e.target.value })} />}
          </Field>
        </div>
        <div className="emblem-side">
          <h3 className="section-title">Emblem</h3>
          <ImageUpload
            spec={IMAGE_SPECS.emblem}
            blob={project.assets[d.emblemAssetId]?.blob}
            fallbackUrl={vanillaEmblemUrl(d.baseDivisionId)}
            onChange={(blob, name) => {
              removeAsset(d.emblemAssetId);
              set({ emblemAssetId: addAsset(blob, name) });
            }}
            onClear={() => {
              removeAsset(d.emblemAssetId);
              set({ emblemAssetId: null });
            }}
          />
        </div>
      </div>

      <h3 className="section-title">Roster</h3>
      <div className="roster">
        {CATEGORIES.map((cat) => {
          const rows = resolved.filter((x) => (x.info?.factory || "Logistic") === cat.id);
          const slots = d.costMatrix?.[cat.id];
          return (
            <div key={cat.id} className="roster-section">
              <div className="roster-section-head">
                <span className="roster-section-name">
                  <strong>{cat.short}</strong> {cat.label}
                </span>
                <span className="muted small">{rows.length} unit{rows.length === 1 ? "" : "s"}</span>
                {slots && (
                  <span className="slot-costs" title="Activation point cost of each successive card slot in this category">
                    <span className="muted small">slot costs</span>
                    {slots.length ? slots.map((s, i) => <span key={i} className="slot">{s}</span>) : <em className="muted small">locked</em>}
                  </span>
                )}
              </div>
              <div className="roster-cards">
                {rows.map(({ rule, info }) => (
                  <RosterCard
                    key={rule.unit}
                    rule={rule}
                    info={info}
                    divisionSide={side}
                    onChange={(patch) => updateRule(rule.unit, patch)}
                    onRemove={() => set({ roster: d.roster.filter((r) => r.unit !== rule.unit) })}
                    onAddTransport={() => setPicker({ mode: "transport", ref: rule.unit })}
                  />
                ))}
                <button type="button" className="roster-add" onClick={() => setPicker({ mode: "add", factory: cat.id })}>
                  + Add {cat.label.toLowerCase()}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="detail-footer">
        <span />
        <Button
          variant="ghost-danger"
          onClick={() => {
            if (window.confirm(`Delete ${d.name}?`)) {
              removeAsset(d.emblemAssetId);
              removeItem("divisions", d.id);
            }
          }}
        >
          Delete division
        </Button>
      </div>

      {picker?.mode === "add" && (
        <UnitPicker
          title={`Add to ${CATEGORIES.find((c) => c.id === picker.factory)?.label}`}
          onClose={() => setPicker(null)}
          options={{ factory: picker.factory, includeCustom: true, exclude: inRoster, side }}
          onPick={(ref) => {
            set({ roster: [...d.roster, defaultRuleFor(game, project, ref)] });
            setPicker(null);
          }}
        />
      )}
      {picker?.mode === "transport" && (
        <UnitPicker
          title="Add a transport"
          onClose={() => setPicker(null)}
          options={{
            transportsOnly: true,
            includeCustom: true,
            side,
            exclude: new Set(d.roster.find((r) => r.unit === picker.ref)?.transports || []),
          }}
          onPick={(ref) => {
            updateRule(picker.ref, (r) => ({ transports: [...(r.transports || []), ref], noTransport: false }));
            setPicker(null);
          }}
        />
      )}
    </section>
  );
}

function RosterCard({ rule, info, divisionSide, onChange, onRemove, onAddTransport }) {
  const { game, project } = useProject();
  if (!info) {
    return (
      <div className="roster-card roster-card-missing">
        <span>Missing unit</span>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove">✕</button>
      </div>
    );
  }
  const unitSide = info.custom ? nationSide(game, project, info.country) : info.base.coalition;
  return (
    <div className={`roster-card ${info.custom ? "roster-card-custom" : ""}`}>
      <div className="roster-card-top">
        <UnitHover base={info.base} unit={info.custom ? info.unit : null} name={info.name}>
          <UnitThumb info={info} className="unit-thumb-sm" />
        </UnitHover>
        <div className="roster-card-name" title={info.base.id}>
          {info.name}
          {unitSide !== divisionSide && <span className="warn-dot" title={`${unitSide} unit in a ${divisionSide} division`}>!</span>}
        </div>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove">✕</button>
      </div>
      <div className="roster-card-nums">
        <label title="Number of cards (MaxPackNumber)">
          cards
          <input type="number" min={1} value={rule.cards} onChange={(e) => onChange({ cards: Math.max(1, Number(e.target.value)) })} />
        </label>
        <label title="Units per card (NumberOfUnitInPack)">
          ×
          <input type="number" min={1} value={rule.perCard} onChange={(e) => onChange({ perCard: Math.max(1, Number(e.target.value)) })} />
        </label>
      </div>
      <div className="roster-card-transport">
        <label className="check">
          <input type="checkbox" checked={rule.noTransport} onChange={(e) => onChange({ noTransport: e.target.checked })} />
          can deploy without transport
        </label>
        {(rule.transports || []).map((t) => {
          const ti = resolveUnitRef(game, project, t);
          return (
            <span key={t} className="transport-chip" title={t}>
              {ti?.name || "missing"}
              <button type="button" onClick={() => onChange({ transports: rule.transports.filter((x) => x !== t) })} aria-label="Remove transport">
                ✕
              </button>
            </span>
          );
        })}
        <button type="button" className="link small" onClick={onAddTransport}>
          + transport
        </button>
      </div>
    </div>
  );
}
