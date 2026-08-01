/* Inlines src/* into a single self-contained index.html.
 * No dependencies, no minifier — the output stays readable and auditable,
 * which matters for a tool people are asked to trust with maths.            */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

const template = read("src/index.template.html");
const parts = {
  "/*__CSS__*/": read("src/style.css"),
  "/*__ENGINE__*/": read("src/engine.js"),
  "/*__I18N__*/": read("src/i18n.js"),
  "/*__APP__*/": read("src/app.js")
};

let out = template;
for (const [token, body] of Object.entries(parts)) {
  if (!out.includes(token)) throw new Error(`template is missing ${token}`);
  // A literal "</script>" inside JS would close the tag early.
  const safe = body.replace(/<\/script>/gi, "<\\/script>");
  out = out.replace(token, () => safe);
}

// Guard: nothing may reach out to the network — this must work fully offline.
const remote = out.match(/\b(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi);
if (remote) throw new Error("external reference in build output: " + remote.join(", "));

writeFileSync(join(root, "index.html"), out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`built index.html — ${kb} KB, self-contained`);

/* Second target: the Artifact host supplies its own doctype/html/head/body,
 * so publish only what goes inside the body (plus the style block). Same
 * sources, so the hosted page and the downloadable file never diverge.     */
const inner = out
  .slice(out.indexOf("<style>"), out.lastIndexOf("</body>"))
  .replace(/<\/head>\s*<body>/i, "")
  .trim();
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "artifact.html"), inner + "\n");
console.log(`built dist/artifact.html — ${(Buffer.byteLength(inner) / 1024).toFixed(0)} KB, body-only`);
