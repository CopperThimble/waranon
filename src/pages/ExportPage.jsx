import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, PageHeader } from "../components/ui";
import { buildModFiles } from "../lib/exportMod";
import { devSampleSource, pickModFolder, sourceFromFileList, supportsDirectoryPicker } from "../lib/modFolder";
import { validateProject } from "../lib/validate";
import { useProject } from "../state/useProject";

const SCOPE_PAGE = { nation: "nations", unit: "units", division: "divisions", ability: "abilities", project: "overview" };

export default function ExportPage({ navigate }) {
  const { game, project } = useProject();
  const [source, setSource] = useState(null);
  const [sourceInfo, setSourceInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [written, setWritten] = useState(false);
  const [devAvailable, setDevAvailable] = useState(false);
  const folderInput = useRef(null);
  const checks = useMemo(() => validateProject(project, game), [project, game]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch("/__modexample-available")
      .then((r) => r.json())
      .then(setDevAvailable)
      .catch(() => {});
  }, []);

  async function connectSource(src) {
    setError("");
    setResult(null);
    setWritten(false);
    setBusy("Checking folder…");
    try {
      const probe = await src.readText("GameData/Generated/Gameplay/Gfx/UniteDescriptor.ndf");
      if (probe == null) {
        throw new Error(
          `"${src.name}" doesn't look like a mod source folder (no GameData/Generated/Gameplay/Gfx/UniteDescriptor.ndf). Pick the folder created by CreateNewMod.bat inside your WARNO/Mods directory.`,
        );
      }
      const version = /'(\d+)'/.exec((await src.readText("Gen/Version.ndf")) || "")?.[1] || null;
      setSource(src);
      setSourceInfo({ version });
    } catch (err) {
      setSource(null);
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    setError("");
    setWritten(false);
    setBusy("Patching files…");
    try {
      setResult(await buildModFiles({ project, game, source }));
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function downloadZip() {
    setBusy("Zipping…");
    const zip = new JSZip();
    for (const f of result.files) zip.file(f.path, f.data);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${source.name}-waranon-patch.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setBusy("");
  }

  async function writeIntoFolder() {
    setError("");
    try {
      if (!(await source.requestWrite())) throw new Error("Write permission was not granted.");
      setBusy("Writing files…");
      for (const f of result.files) await source.writeFile(f.path, f.data);
      setWritten(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const versionMismatch = sourceInfo?.version && game.gameVersion && sourceInfo.version !== game.gameVersion;

  return (
    <div className="page">
      <PageHeader title="Export" subtitle="Patch your WARNO mod folder with this project." />

      <section className="card export-step">
        <h2 className="card-title">
          <span className="step-n">1</span> Check the project
        </h2>
        {checks.errors.length === 0 && checks.warnings.length === 0 && <p className="ok">✓ No problems found.</p>}
        <IssueList kind="error" items={checks.errors} navigate={navigate} />
        <IssueList kind="warning" items={checks.warnings} navigate={navigate} />
      </section>

      <section className="card export-step">
        <h2 className="card-title">
          <span className="step-n">2</span> Choose your mod folder
        </h2>
        <p className="muted">
          Pick the folder created by <code>CreateNewMod.bat</code>, e.g. <code>…/steamapps/common/WARNO/Mods/MyMod</code>. The builder reads the game
          files in it, so the output matches your game version. Nothing is uploaded anywhere.
        </p>
        <div className="row gap wrap">
          {supportsDirectoryPicker() ? (
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await connectSource(await pickModFolder());
                } catch (err) {
                  if (err.name !== "AbortError") setError(err.message);
                }
              }}
            >
              Choose mod folder…
            </Button>
          ) : (
            <Button variant="primary" onClick={() => folderInput.current?.click()}>
              Choose mod folder…
            </Button>
          )}
          {devAvailable && <Button onClick={() => connectSource(devSampleSource())}>Use SampleMods/modexample (dev)</Button>}
          <input
            ref={folderInput}
            type="file"
            hidden
            webkitdirectory=""
            onChange={(e) => e.target.files.length && connectSource(sourceFromFileList(e.target.files))}
          />
        </div>
        {!supportsDirectoryPicker() && (
          <p className="muted small">Your browser can only read the folder; you'll get a zip to extract. Chrome or Edge can write the files in place.</p>
        )}
        {source && (
          <div className="source-info">
            <strong>📁 {source.name}</strong>
            <span className="muted small">
              {sourceInfo?.version ? `game data ${sourceInfo.version}` : "game version unknown"} · {source.canWrite ? "read & write" : "read only"}
            </span>
          </div>
        )}
        {versionMismatch && (
          <p className="warning-text">
            This folder is game data {sourceInfo.version} but the builder's catalog is {game.gameVersion}. Export still patches your files,
            but units or divisions that changed between versions may not be found.
          </p>
        )}
      </section>

      <section className="card export-step">
        <h2 className="card-title">
          <span className="step-n">3</span> Generate
        </h2>
        <Button variant="primary" onClick={generate} disabled={!source || checks.errors.length > 0 || !!busy}>
          Generate mod files
        </Button>
        {checks.errors.length > 0 && <span className="muted small"> Fix the errors above first.</span>}
        {busy && <p className="muted">{busy}</p>}
        {error && <p className="error-text">{error}</p>}

        {result && (
          <>
            <table className="file-table">
              <thead>
                <tr>
                  <th />
                  <th>File</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {result.files.map((f) => (
                  <tr key={f.path}>
                    <td>
                      <span className={`file-kind file-${f.kind}`}>{f.kind === "new" ? "new" : "edit"}</span>
                    </td>
                    <td className="mono small">{f.path}</td>
                    <td className="small">{f.notes.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row gap wrap">
              {source.canWrite && (
                <Button variant="primary" onClick={writeIntoFolder} disabled={!!busy}>
                  Write into {source.name}
                </Button>
              )}
              <Button onClick={downloadZip} disabled={!!busy}>
                Download .zip
              </Button>
            </div>
            {written && <p className="ok">✓ {result.files.length} files written to {source.name}.</p>}
            <div className="callout">
              <strong>Next: run GenerateMod.bat in {source.name}, every time you export.</strong> It compiles the text files (unit and division names,
              tooltips) into the dictionaries the game reads. Skipping it causes errors like "No string found for token … in dictionary list
              'UNITS'".
            </div>
            <p className="muted small">
              Re-exporting is safe: everything the builder adds is fenced with <code>// waranon</code> comments and replaced on the next export.
              Back up your mod folder first if you've hand-edited these files.
            </p>
          </>
        )}
      </section>

      <section className="card export-step">
        <h2 className="card-title">
          <span className="step-n">4</span> Build and test in WARNO
        </h2>
        <ol className="explain">
          <li>If you downloaded the zip, extract it into your mod folder and let it overwrite files.</li>
          <li>
            Run <code>GenerateMod.bat</code> in the mod folder. Read its report for NDF errors.
          </li>
          <li>
            Run <code>LaunchGameDevMode.bat</code> and look for your division in the multiplayer deck builder.
          </li>
          <li>
            Publish with <code>UploadMod.bat</code> when you're happy.
          </li>
        </ol>
      </section>
    </div>
  );
}

function IssueList({ kind, items, navigate }) {
  if (!items.length) return null;
  return (
    <div className={`issues issues-${kind}`}>
      <div className="issues-title">
        {items.length} {kind}
        {items.length > 1 ? "s" : ""}
        {kind === "warning" && <span className="muted small"> (export still works)</span>}
      </div>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" className="link" onClick={() => navigate(SCOPE_PAGE[it.scope] || "overview")}>
              {it.scope}
            </button>{" "}
            {it.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
