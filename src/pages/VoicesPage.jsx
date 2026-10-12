import { useMemo, useState } from "react";
import ClipEditor from "../components/ClipEditor";
import { Button, Empty, PageHeader } from "../components/ui";
import { NationFlag, SpecIcon } from "../components/visuals";
import { decodeBlob, play, stopPlayback } from "../lib/audio";
import { newId } from "../lib/model";
import { VOICE_ACTIONS, clipCounts, filterLabel, lineKey, unitVoiceCategory, voiceCategories, voiceCategoryLabel } from "../lib/voices";
import { useProject } from "../state/useProject";

const ACTION_ORDER = Object.keys(VOICE_ACTIONS);

/** Voice studio: record or upload a nation's unit voice lines, per voice category and event. */
export default function VoicesPage({ navigate, route }) {
  const { game, project, patchItem, addAsset, removeAsset } = useProject();
  const nations = project.nations;
  const [nationId, setNationId] = useState(() => (route?.id && nations.some((n) => n.id === route.id) ? route.id : nations[0]?.id));
  const nation = nations.find((n) => n.id === nationId) || nations[0];
  const cats = useMemo(() => voiceCategories(game), [game]);
  const [category, setCategory] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState(null); // { clip?, action, start, prompt }

  // categories your units speak with -> their units
  const used = useMemo(() => {
    const m = new Map();
    if (!nation) return m;
    for (const u of project.units) {
      if (u.nationTag !== nation.tag) continue;
      const base = game.unitsById.get(u.baseUnitId);
      const c = base && unitVoiceCategory(game, base);
      if (!c) continue;
      if (!m.has(c)) m.set(c, { units: [], role: base.role });
      m.get(c).units.push(u);
    }
    return m;
  }, [game, project.units, nation]);

  if (!nation) {
    return (
      <div className="page">
        <PageHeader title="Voices" />
        <Empty icon="♪" title="No nations yet" action={<Button variant="primary" onClick={() => navigate("nations")}>Create a nation</Button>}>
          Voice lines belong to a nation: every unit of that nation speaks with them.
        </Empty>
      </div>
    );
  }

  const voice = nation.voice || { clips: [] };
  const counts = clipCounts(nation);
  const setVoice = (patch) => patchItem("nations", nation.id, { voice: { ...voice, ...patch } });
  const current = category && cats.get(category) ? category : [...used.keys()][0] || "Inf";
  const cat = cats.get(current);
  const copiedHasIt = !!nation.voiceCountry && cat?.countries.has(nation.voiceCountry);
  const allCats = [...cats.values()].filter((c) => !used.has(c.base)).sort((a, b) => voiceCategoryLabel(a.base).localeCompare(voiceCategoryLabel(b.base)));
  const actions = cat ? [...cat.actions].filter((a) => VOICE_ACTIONS[a]).sort((a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b)) : [];

  function saveClip({ sourceBlob, edit, oggBlob, duration, name }) {
    const old = editor?.clip;
    const assetId = addAsset(oggBlob, `${name}.ogg`);
    const sameSource = old && project.assets[old.sourceAssetId]?.blob === sourceBlob;
    const sourceAssetId = sameSource ? old.sourceAssetId : addAsset(sourceBlob, `${name} (original)`);
    if (old) {
      removeAsset(old.assetId);
      if (old.sourceAssetId !== sourceAssetId) removeAsset(old.sourceAssetId);
    }
    const clip = { id: old?.id || newId(), category: current, action: editor?.action, name, assetId, sourceAssetId, edit, duration };
    const clips = old ? voice.clips.map((c) => (c.id === old.id ? clip : c)) : [...voice.clips, clip];
    setVoice({ clips });
    setEditor(null);
  }

  function deleteClip(c) {
    removeAsset(c.assetId);
    removeAsset(c.sourceAssetId);
    setVoice({ clips: voice.clips.filter((x) => x.id !== c.id) });
  }

  async function playClip(c, radio) {
    const blob = project.assets[c.assetId]?.blob;
    if (!blob) return;
    play(await decodeBlob(blob), radio ? cat?.filter : null);
  }

  const catButton = (c, extra) => (
    <button type="button" key={c.base} className={`voice-cat ${c.base === current ? "active" : ""}`} onClick={() => setCategory(c.base)}>
      <span className="voice-cat-name">
        {extra?.role && <SpecIcon spec={extra.role} size={14} />} {voiceCategoryLabel(c.base)}
      </span>
      <span className="muted small">
        {extra ? `${extra.units.length} unit${extra.units.length > 1 ? "s" : ""}` : ""}
        {counts.get(c.base) ? `${extra ? " · " : ""}${counts.get(c.base)} line${counts.get(c.base) > 1 ? "s" : ""}` : ""}
      </span>
    </button>
  );

  return (
    <div className="page">
      <PageHeader
        title="Voices"
        subtitle="Record or upload what your units say. Lines you add here replace (or join) the copied country's lines when you export, so they survive every re-export."
      />
      <div className="chips">
        {nations.map((n) => (
          <button type="button" key={n.id} className={`chip ${n.id === nation.id ? "chip-on" : ""}`} onClick={() => setNationId(n.id)}>
            <NationFlag tag={n.tag} size={14} /> {n.name || n.tag || "Unnamed"}
            {n.voice?.clips?.length ? <span className="chip-count">{n.voice.clips.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="voice-layout">
        <aside className="voice-cats card">
          <div className="muted small voice-copy">
            Other lines are copied from{" "}
            <select className="input input-sm" value={nation.voiceCountry || ""} onChange={(e) => patchItem("nations", nation.id, { voiceCountry: e.target.value || null })}>
              <option value="">nobody (only your clips)</option>
              {game.countries.map((c) => (
                <option key={c.tag} value={c.tag}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="voice-cat-title">Your units speak as</div>
          {used.size ? [...used.entries()].map(([base, extra]) => cats.get(base) && catButton(cats.get(base), extra)) : <p className="muted small">No units for {nation.name || nation.tag} yet.</p>}
          <button type="button" className="link small voice-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide other categories" : `Other categories (${allCats.length})`}
          </button>
          {showAll && allCats.map((c) => catButton(c))}
        </aside>

        <section className="card voice-main">
          <div className="voice-head">
            <div>
              <h2>{voiceCategoryLabel(current)}</h2>
              <div className="muted small">
                In game: {filterLabel(cat?.filter || "RadioOutside")} ·{" "}
                {copiedHasIt ? `copied ${game.countriesByTag.get(nation.voiceCountry)?.name || nation.voiceCountry} lines play for any event you leave empty` : "no copied lines: events you leave empty stay silent"}
                {used.get(current) && ` · used by ${used.get(current).units.map((u) => u.name).join(", ")}`}
              </div>
            </div>
          </div>

          {actions.map((action) => {
            const meta = VOICE_ACTIONS[action];
            const k = lineKey(current, action);
            const clips = voice.clips.filter((c) => c.category === current && c.action === action);
            const keep = !!voice.keepVanilla?.[k];
            const prompt = meta.prompts[(clips.length + 1) % Math.max(1, meta.prompts.length)] || meta.prompts[0];
            return (
              <div key={action} className={`voice-line ${clips.length ? "has-clips" : ""}`}>
                <div className="voice-line-head">
                  <div>
                    <strong>{meta.label}</strong> <span className="muted small">{meta.when}</span>
                  </div>
                  <div className="row gap-sm">
                    <Button size="sm" variant="primary" onClick={() => setEditor({ action, start: "record", prompt })}>
                      ● Record
                    </Button>
                    <Button size="sm" onClick={() => setEditor({ action, start: "upload", prompt })}>
                      Upload
                    </Button>
                  </div>
                </div>
                {meta.prompts.length > 0 && (
                  <div className="voice-prompts muted small">
                    Ideas: {meta.prompts.map((p) => `“${p}”`).join(" · ")}
                  </div>
                )}
                {clips.length > 0 && (
                  <ul className="voice-clips">
                    {clips.map((c) => (
                      <li key={c.id}>
                        <span className="voice-clip-name">{c.name}</span>
                        <span className="muted small">{c.duration ? `${c.duration.toFixed(1)}s` : ""}</span>
                        <button type="button" className="icon-btn" title="Play" onClick={() => playClip(c, false)}>
                          ▶
                        </button>
                        <button type="button" className="icon-btn" title="Play with the radio preview" onClick={() => playClip(c, true)}>
                          📻
                        </button>
                        <button
                          type="button"
                          className="link small"
                          onClick={async () => {
                            stopPlayback();
                            const src = project.assets[c.sourceAssetId]?.blob;
                            if (src) setEditor({ action, clip: c, start: { sourceBlob: src, edit: c.edit, name: c.name }, prompt: null });
                          }}
                        >
                          edit
                        </button>
                        <button type="button" className="link small danger" onClick={() => deleteClip(c)}>
                          delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {clips.length > 0 && copiedHasIt && (
                  <label className="check small voice-keep">
                    <input type="checkbox" checked={keep} onChange={(e) => setVoice({ keepVanilla: { ...voice.keepVanilla, [k]: e.target.checked || undefined } })} />
                    Also keep the copied lines (the game picks one at random each time)
                  </label>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {editor && (
        <ClipEditor
          start={editor.start}
          prompt={editor.prompt}
          filter={cat?.filter || "RadioOutside"}
          title={`${voiceCategoryLabel(current)} · ${VOICE_ACTIONS[editor.action].label}`}
          onSave={saveClip}
          onClose={() => {
            stopPlayback();
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
