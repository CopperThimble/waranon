import { useRef } from "react";
import { Button, Field, PageHeader } from "../components/ui";
import { projectToFile } from "../lib/storage";
import { useProject } from "../state/useProject";

export default function ProjectPage({ navigate }) {
  const ctx = useProject();
  const { game, project, projects, update } = ctx;
  const importInput = useRef(null);

  const steps = [
    { done: project.nations.length > 0, label: "Create a nation", hint: "Country tag, name, flag, and voice lines.", to: "nations" },
    { done: project.units.length > 0, label: "Design units", hint: "Clone any vanilla unit, rename it, rebalance its stats, upload an icon.", to: "units" },
    { done: project.divisions.length > 0, label: "Build a division", hint: "Units only appear in-game inside a division's roster.", to: "divisions" },
    { done: false, label: "Export into your mod folder", hint: "Patches your mod's files; then run GenerateMod.bat.", to: "export" },
  ];

  async function downloadProject() {
    const blob = await projectToFile(project);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w-]+/g, "_") || "project"}.waranon.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="page">
      <PageHeader title="Overview" subtitle={`Game data version ${game.gameVersion} · ${game.units.length.toLocaleString()} vanilla units · ${game.divisions.length} divisions`} />

      <div className="overview-grid">
        <section className="card">
          <h2 className="card-title">Project</h2>
          <Field label="Project name" hint="Only used inside this builder.">
            {(id) => <input id={id} className="input" value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} />}
          </Field>
          <div className="counts">
            {[
              ["Nations", project.nations.length, "nations"],
              ["Units", project.units.length, "units"],
              ["Divisions", project.divisions.length, "divisions"],
            ].map(([label, n, to]) => (
              <button type="button" key={label} className="count" onClick={() => navigate(to)}>
                <span className="count-n">{n}</span>
                <span className="count-label">{label}</span>
              </button>
            ))}
          </div>
          <p className="muted small">Saved automatically in this browser. Download a project file to back it up or move it to another machine.</p>
          <div className="row gap">
            <Button onClick={downloadProject}>Download project file</Button>
            <Button onClick={() => importInput.current?.click()}>Import project file</Button>
            <input
              ref={importInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files[0];
                e.target.value = "";
                if (!file) return;
                try {
                  await ctx.importProject(file);
                } catch (err) {
                  alert(err.message);
                }
              }}
            />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Getting started</h2>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s.label} className={s.done ? "step-done" : ""}>
                <span className="step-n">{s.done ? "✓" : i + 1}</span>
                <div>
                  <button type="button" className="link step-link" onClick={() => navigate(s.to)}>
                    {s.label}
                  </button>
                  <div className="muted small">{s.hint}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <h2 className="card-title">Your projects</h2>
          <ul className="project-list">
            {[...projects]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((p) => (
                <li key={p.id} className={p.id === project.id ? "active" : ""}>
                  <button type="button" onClick={() => p.id !== project.id && ctx.switchProject(p.id)}>
                    <span>{p.id === project.id ? project.name : p.name}</span>
                    <span className="muted small">{new Date(p.id === project.id ? project.updatedAt : p.updatedAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
          </ul>
          <div className="row gap wrap">
            <Button variant="primary" onClick={() => ctx.createProject("New WARNO mod")}>New project</Button>
            <Button onClick={() => ctx.duplicateProject()}>Duplicate</Button>
            <Button
              variant="danger"
              onClick={() => window.confirm(`Delete "${project.name}" permanently?`) && ctx.deleteCurrentProject()}
            >
              Delete
            </Button>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">How WARNO mods work</h2>
          <ol className="explain">
            <li>
              In your WARNO install, run <code>Mods/CreateNewMod.bat YourMod</code>. That creates a <em>source</em> folder: a full editable copy of the game data.
            </li>
            <li>This builder patches the files in that folder (or gives you a zip to extract over it).</li>
            <li>
              Run <code>GenerateMod.bat</code> in the mod folder to compile it, then <code>LaunchGameDevMode.bat</code> to test.
            </li>
            <li>
              When the game updates, run <code>UpdateMod.bat</code>, then re-export from here.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
