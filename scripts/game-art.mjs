// Switch the game artwork in images/ on or off in one step.
//
//   npm run art -- status
//   npm run art -- off   hide all game art in the app AND stop tracking it in git (local files are kept)
//   npm run art -- on    show it again AND track it again
//
// "off" sets "gameArt": false in waranon.config.json, untracks the art (git rm --cached) and
// adds it to .gitignore. Nothing is committed: review with `git status`, then commit and push.
// Pushing removes the art from the live site and the current branch, but NOT from git history.
// images/unit-icons/ (the raw PNG extraction) is ignored separately and never added here;
// images/portraits/ (the WebP copies the app uses) is part of the art switch.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const CONFIG = "waranon.config.json";
const GITIGNORE = ".gitignore";
const START = "# >>> game art switched off (npm run art -- on to restore)";
const END = "# <<< game art";
const ART_PATHS = [
  "images/portraits",
  "images/flags",
  "images/divisions",
  "images/weapons",
  "images/specialties",
  "images/traits",
  "images/warno.png",
  "images/warno-let-loose-transparent.png",
  "images/waryes-transparent.png",
  "images/frago-transparent.png",
];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const existing = () => ART_PATHS.filter((p) => fs.existsSync(p));
const tracked = () => (existing().length ? git("ls-files", "--", ...existing()).split("\n").filter(Boolean) : []);

function setConfig(on) {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  config.gameArt = on;
  fs.writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

function setIgnored(ignored) {
  let text = fs.readFileSync(GITIGNORE, "utf8").replace(/\r\n/g, "\n");
  const re = new RegExp(`\\n?${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}\\n?`, "g");
  text = text.replace(re, "\n").replace(/\n{3,}/g, "\n\n");
  if (ignored) text = `${text.replace(/\n*$/, "\n")}\n${START}\n${ART_PATHS.join("\n")}\n${END}\n`;
  fs.writeFileSync(GITIGNORE, text);
}

function status() {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const ignored = fs.readFileSync(GITIGNORE, "utf8").includes(START);
  console.log(`gameArt in ${CONFIG}: ${config.gameArt !== false ? "on" : "off"}`);
  console.log(`tracked game-art files: ${tracked().length}`);
  console.log(`listed in .gitignore:   ${ignored ? "yes" : "no"}`);
}

const cmd = process.argv[2] || "status";
if (cmd === "off") {
  const files = tracked();
  setConfig(false);
  setIgnored(true);
  if (files.length) git("rm", "-r", "-q", "--cached", "--", ...existing());
  console.log(`Game art OFF: hidden in the app and ${files.length} files untracked (still on your disk).`);
  console.log("Next: git status, then commit and push. The art stays in git history; ask if you need it purged.");
} else if (cmd === "on") {
  setConfig(true);
  setIgnored(false);
  if (existing().length) git("add", "--", ...existing());
  console.log(`Game art ON: shown in the app and ${tracked().length} files tracked again.`);
  console.log("images/unit-icons/ (raw PNG extraction) stays ignored; the app uses images/portraits/.");
} else if (cmd === "status") {
  status();
} else {
  console.error("usage: npm run art -- on | off | status");
  process.exit(1);
}
