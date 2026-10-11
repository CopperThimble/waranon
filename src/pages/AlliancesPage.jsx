import { Button, Empty, Field, PageHeader, SideBadge } from "../components/ui";
import { NationFlag } from "../components/visuals";
import { BUILTIN_ALLIANCES, newAlliance } from "../lib/model";
import { useProject } from "../state/useProject";

export default function AlliancesPage() {
  const { project, addItem, patchItem, removeItem } = useProject();
  const membersOf = (id) => project.nations.filter((n) => n.allianceId === id);

  return (
    <div className="page">
      <PageHeader
        title="Alliances"
        subtitle="Group nations under a banner. Each alliance fights on the NATO or PACT side: the engine only supports those two."
        actions={<Button variant="primary" onClick={() => addItem("alliances", newAlliance())}>+ New alliance</Button>}
      />

      <div className="alliance-grid">
        {BUILTIN_ALLIANCES.map((a) => (
          <section key={a.id} className="card alliance-card" style={{ "--accent": a.color }}>
            <div className="alliance-head">
              <h2>{a.name}</h2>
              <SideBadge side={a.side} />
            </div>
            <p className="muted small">Vanilla side. Pick it directly for a nation that should sit alongside the existing countries.</p>
            <Members nations={membersOf(a.id)} />
          </section>
        ))}

        {project.alliances.map((a) => (
          <section key={a.id} className="card alliance-card" style={{ "--accent": a.color }}>
            <div className="row gap">
              <Field label="Name" className="grow">
                {(id) => <input id={id} className="input" value={a.name} onChange={(e) => patchItem("alliances", a.id, { name: e.target.value })} />}
              </Field>
              <Field label="Color">
                {(id) => <input id={id} type="color" className="color-input" value={a.color} onChange={(e) => patchItem("alliances", a.id, { color: e.target.value })} />}
              </Field>
            </div>
            <Field label="Fights on the side of" hint="Decides which side its nations' units and divisions belong to in-game.">
              <div className="segmented">
                {["NATO", "PACT"].map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={a.side === s ? "on" : ""}
                    onClick={() => patchItem("alliances", a.id, { side: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Description">
              {(id) => (
                <textarea
                  id={id}
                  className="input"
                  rows={2}
                  value={a.description}
                  placeholder="Background, flavour text…"
                  onChange={(e) => patchItem("alliances", a.id, { description: e.target.value })}
                />
              )}
            </Field>
            <Members nations={membersOf(a.id)} />
            <div className="row end">
              <Button
                variant="ghost-danger"
                size="sm"
                onClick={() => window.confirm(`Delete alliance "${a.name}"? Its nations move to NATO.`) && removeItem("alliances", a.id)}
              >
                Delete
              </Button>
            </div>
          </section>
        ))}
      </div>

      {!project.alliances.length && (
        <Empty icon="⚑" title="No custom alliances yet">
          You can skip this and put nations straight on NATO or the Warsaw Pact.
        </Empty>
      )}
    </div>
  );
}

function Members({ nations }) {
  if (!nations.length) return <div className="muted small">No nations yet.</div>;
  return (
    <div className="members">
      {nations.map((n) => (
        <span key={n.id} className="member">
          <NationFlag tag={n.tag} size={18} /> {n.name || n.tag || "Unnamed"}
        </span>
      ))}
    </div>
  );
}
