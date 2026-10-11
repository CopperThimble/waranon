import { useState } from "react";
import { Button, Empty, Field, ImageUpload, PageHeader, SideBadge } from "../components/ui";
import { NationFlag } from "../components/visuals";
import { IMAGE_SPECS, vanillaFlagUrl } from "../lib/images";
import { allAlliances, allianceById, newNation, sanitizeTag, tagProblem } from "../lib/model";
import { useProject } from "../state/useProject";

export default function NationsPage({ navigate }) {
  const { project, addItem } = useProject();
  const [selectedId, setSelectedId] = useState(project.nations[0]?.id || null);
  const selected = project.nations.find((n) => n.id === selectedId) || project.nations[0];

  function create() {
    const n = newNation();
    addItem("nations", n);
    setSelectedId(n.id);
  }

  return (
    <div className="page">
      <PageHeader
        title="Nations"
        subtitle="New countries with their own flag, name, side, and voice lines."
        actions={<Button variant="primary" onClick={create}>+ New nation</Button>}
      />
      {!project.nations.length ? (
        <Empty icon="⚐" title="No nations yet" action={<Button variant="primary" onClick={create}>Create your first nation</Button>}>
          A nation gives your units and divisions a country tag, flag, and side.
        </Empty>
      ) : (
        <div className="md-layout">
          <aside className="md-list">
            {project.nations.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`md-item ${n.id === selected?.id ? "active" : ""}`}
                onClick={() => setSelectedId(n.id)}
              >
                <NationFlag tag={n.tag} size={28} />
                <span className="md-item-text">
                  <span className="md-item-title">{n.name || "Unnamed nation"}</span>
                  <span className="md-item-sub">
                    {n.tag || "no tag"} · {allianceById(project, n.allianceId).name}
                  </span>
                </span>
              </button>
            ))}
          </aside>
          {selected && <NationEditor key={selected.id} nation={selected} navigate={navigate} />}
        </div>
      )}
    </div>
  );
}

function NationEditor({ nation: n, navigate }) {
  const { game, project, patchItem, removeItem, addAsset, removeAsset } = useProject();
  const set = (patch) => patchItem("nations", n.id, patch);
  const alliance = allianceById(project, n.allianceId);
  const units = project.units.filter((u) => u.nationTag === n.tag && n.tag);
  const divisions = project.divisions.filter((d) => d.nationTag === n.tag && n.tag);
  const tagError = tagProblem(game, project, n.id, n.tag);

  function changeTag(raw) {
    const tag = sanitizeTag(raw);
    // keep units/divisions attached when the tag is renamed
    patchItem("nations", n.id, { tag });
    if (n.tag && tag !== n.tag) {
      for (const u of project.units) if (u.nationTag === n.tag) patchItem("units", u.id, { nationTag: tag });
      for (const d of project.divisions) if (d.nationTag === n.tag) patchItem("divisions", d.id, { nationTag: tag });
    }
  }

  return (
    <section className="md-detail card">
      <div className="detail-head">
        <NationFlag tag={n.tag} size={56} />
        <div className="grow">
          <h2>{n.name || "Unnamed nation"}</h2>
          <div className="row gap-sm">
            <SideBadge side={alliance.side} />
            <span className="muted small">
              {units.length} unit{units.length === 1 ? "" : "s"} · {divisions.length} division{divisions.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <div className="form-grid">
        <Field label="Name" hint="Shown in menus and the deck builder.">
          {(id) => <input id={id} className="input" value={n.name} placeholder="e.g. Ruritania" onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field label="Country tag" error={tagError} hint="2–6 letters/digits. Used internally and in file names.">
          {(id) => <input id={id} className="input mono" value={n.tag} placeholder="RUR" onChange={(e) => changeTag(e.target.value)} />}
        </Field>
        <Field label="Alliance">
          {(id) => (
            <select id={id} className="input" value={n.allianceId} onChange={(e) => set({ allianceId: e.target.value })}>
              {allAlliances(project).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.side})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Random unit names" hint="Which language pool the game uses to name individual units.">
          {(id) => (
            <select id={id} className="input" value={n.unitNamesDico} onChange={(e) => set({ unitNamesDico: e.target.value })}>
              {game.unitNameDicos.map((d) => (
                <option key={d} value={d}>
                  {d.replace("NAMES_", "")}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Voice lines" hint="Unit acknowledgements are copied from this country.">
          {(id) => (
            <select id={id} className="input" value={n.voiceCountry || ""} onChange={(e) => set({ voiceCountry: e.target.value || null })}>
              <option value="">None (generic sounds)</option>
              {game.countries.map((c) => (
                <option key={c.tag} value={c.tag}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <h3 className="section-title">Flag</h3>
      <div className="flag-row">
        <ImageUpload
          className="flag-upload"
          spec={IMAGE_SPECS.flag}
          blob={project.assets[n.flagAssetId]?.blob}
          fallbackUrl={vanillaFlagUrl(game.countriesByTag.get(n.baseFlagCountry))}
          onChange={(blob, name) => {
            removeAsset(n.flagAssetId);
            set({ flagAssetId: addAsset(blob, name) });
          }}
          onClear={() => {
            removeAsset(n.flagAssetId);
            set({ flagAssetId: null });
          }}
        />
        <div className="grow">
          <Field label="Use a vanilla flag instead" hint="Used when no image is uploaded.">
            {(id) => (
              <select id={id} className="input" value={n.baseFlagCountry} onChange={(e) => set({ baseFlagCountry: e.target.value })}>
                {game.countries.map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <p className="muted small">Any image works; it's resized to 640×384 PNG, which is what the game uses.</p>
        </div>
      </div>

      <div className="detail-footer">
        <div className="row gap">
          <Button onClick={() => navigate("units")}>Design units →</Button>
          <Button onClick={() => navigate("divisions")}>Build divisions →</Button>
        </div>
        <Button
          variant="ghost-danger"
          onClick={() => {
            const extra = units.length + divisions.length ? ` Its ${units.length} unit(s) and ${divisions.length} division(s) will need a new nation.` : "";
            if (window.confirm(`Delete ${n.name || "this nation"}?${extra}`)) {
              removeAsset(n.flagAssetId);
              removeItem("nations", n.id);
            }
          }}
        >
          Delete nation
        </Button>
      </div>
    </section>
  );
}
