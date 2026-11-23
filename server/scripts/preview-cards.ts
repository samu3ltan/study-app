// Make a page you can open in a browser to see the cards as a student would.
// Usage (from the server folder):
//   node scripts/preview-cards.ts ../eval/benchmark/medicine/page-001
// Reads page.cards.json and the page image; writes page.preview.html into the page folder.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/preview-cards.ts <page folder>");
  process.exit(2);
}
const pageDir = resolve(dir);
const data = JSON.parse(readFileSync(join(pageDir, "page.cards.json"), "utf8"));

let img = "";
for (const [name, type] of [["page.png", "image/png"], ["page.jpg", "image/jpeg"], ["page.jpeg", "image/jpeg"], ["page.small.jpg", "image/jpeg"]]) {
  const p = join(pageDir, name);
  if (existsSync(p)) {
    img = `data:${type};base64,${readFileSync(p).toString("base64")}`;
    break;
  }
}

type Box = { left: number; top: number; width: number; height: number };
type Label = { id: string; text: string; ocrText: string; corrected: boolean; mask: Box; flags: string[] };
const labels = new Map<string, Label>((data.labels as Label[]).map((l) => [l.id, l]));
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pct = (b: Box) => `left:${b.left * 100}%;top:${b.top * 100}%;width:${b.width * 100}%;height:${b.height * 100}%`;

const status = (c: any) =>
  !c.check.ok ? ["rejected", "Rejected"] : c.check.needsConfirmation ? ["confirm", "Needs your tap"] : c.check.needsModelCheck ? ["check", "Needs AI check"] : ["ok", "Passed checks"];

let n = 0;
const sections = (data.cards as any[]).map((c) => {
  n++;
  const [cls, word] = status(c);
  const problems = c.check.problems?.length ? `<ul class="problems">${c.check.problems.map((p: string) => `<li>${esc(p)}</li>`).join("")}</ul>` : "";
  if (c.kind === "occlusion") {
    const ids: string[] = c.occlusion.labelIds;
    const masks = ids
      .map((id, i) => {
        const l = labels.get(id)!;
        return `<div class="mask" style="${pct(l.mask)}"><span>${i + 1}</span></div>`;
      })
      .join("");
    const answers = ids
      .map((id, i) => {
        const l = labels.get(id)!;
        const fix = l.corrected ? ` <em>(page reader saw “${esc(l.ocrText)}”)</em>` : "";
        return `<li><b>${i + 1}.</b> ${esc(l.text)}${fix}</li>`;
      })
      .join("");
    return `<section class="card">
  <header><h2>Card ${n} · hidden labels</h2><span class="pill ${cls}">${word}</span></header>
  <p class="q">${esc(c.front)}</p>
  <div class="figure"><img src="${img}" alt="Page with hidden labels">${masks}</div>
  <button onclick="this.closest('.card').classList.toggle('open')">Show / hide answer</button>
  <ol class="answer">${answers}</ol>${problems}
</section>`;
  }
  return `<section class="card">
  <header><h2>Card ${n} · question</h2><span class="pill ${cls}">${word}</span></header>
  <p class="q">${esc(c.front)}</p>
  <button onclick="this.closest('.card').classList.toggle('open')">Show / hide answer</button>
  <p class="answer">${esc(c.back)}</p>${problems}
</section>`;
});

const title = `${data.subject} · ${pageDir.split("/").pop()}`;
const score = data.score?.matched ? `<p class="sub">Labels found: <b>${data.score.matched.length} of ${data.score.expected}</b></p>` : "";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card preview</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e4e2dc;--mask:#e8833a;--ok:#2f7d4f;--warn:#a86400;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--card:#222225;--ink:#f2f2f2;--muted:#a0a0a6;--line:#38383c;--ok:#6cc08b;--warn:#e7a44a;--bad:#f08b84}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 18px}
header{display:flex;justify-content:space-between;align-items:center;gap:8px}h2{font-size:15px;margin:0;color:var(--muted);font-weight:600}
.q{font-size:18px;font-weight:600;margin:8px 0 12px}
.figure{position:relative;width:100%;border-radius:8px;overflow:hidden;background:#fff}.figure img{display:block;width:100%;height:auto}
.mask{position:absolute;background:var(--mask);border:2px solid #fff;border-radius:6px;display:flex;align-items:center;justify-content:center}
.mask span{color:#fff;font-weight:700;font-size:clamp(12px,2.4vw,20px)}
.card.open .mask{opacity:.18}
button{margin-top:12px;font:inherit;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
.answer{display:none;margin:12px 0 0;padding-left:0;list-style:none}.card.open .answer{display:block}.answer li{margin:4px 0}em{color:var(--muted)}
.pill{font-size:13px;font-weight:600;padding:2px 10px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}
.pill.ok{color:var(--ok)}.pill.confirm,.pill.check{color:var(--warn)}.pill.rejected{color:var(--bad)}
.problems{margin:12px 0 0;padding:10px 12px 10px 28px;border-radius:8px;background:var(--bg);color:var(--warn);font-size:14px}
</style></head><body><main>
<h1>Card preview</h1><p class="sub">${esc(title)} · ${data.cards.length} cards · tap “Show / hide answer” on each card</p>${score}
${sections.join("\n")}
</main></body></html>`;

const out = join(pageDir, "page.preview.html");
writeFileSync(out, html);
console.log(`Preview: ${out}`);
