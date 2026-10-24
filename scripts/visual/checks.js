/*
 * Contrôles déterministes de l'interface.
 *  - collectMetrics : s'exécute DANS la page (page.evaluate), ne renvoie que des données brutes.
 *  - evaluateMetrics : pur, côté Node, applique les seuils de thresholds.json. Entièrement testable sans navigateur.
 * Aucun modèle ici : même capture, même verdict.
 */

/* ---------- côté page (sérialisé par Playwright : doit rester autonome) ---------- */
function collectMetrics(rootSel) {
  const root = (rootSel && document.querySelector(rootSel)) || document.body;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  function shortSel(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter((c) => c && c !== "active" && c !== "show").slice(0, 2);
    if (cls.length) s += "." + cls.join(".");
    return s;
  }
  function effectiveOpacity(el) {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  }
  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return effectiveOpacity(el) > 0.05;
  }
  function bgChain(el) {
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      chain.push({ color: cs.backgroundColor, image: cs.backgroundImage === "none" ? "" : cs.backgroundImage });
    }
    return chain;
  }
  function textOf(el) {
    let t = "";
    el.childNodes.forEach((c) => { if (c.nodeType === 3) t += c.nodeValue; });
    return t.trim();
  }

  const texts = [];
  const stage = document.getElementById("stage");
  root.querySelectorAll("*").forEach((el) => {
    const t = textOf(el);
    const isField = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
    if (!t && !isField) return;
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    const inStage = !!(stage && stage.contains(el));
    let kind = "other";
    // Convention : data-visual-kind="primary|secondary" ; les classes d'origine de Cantoria restent reconnues.
    const dk = el.getAttribute("data-visual-kind");
    if (dk === "secondary" || el.classList.contains("seg-chord")) kind = "chord";
    else if (dk === "primary" || el.classList.contains("seg-word")) kind = "lyric";
    texts.push({
      sel: shortSel(el), text: (t || el.value || el.placeholder || "").slice(0, 40),
      fontPx: parseFloat(cs.fontSize), color: cs.color, opacity: effectiveOpacity(el),
      bg: bgChain(el), inStage, kind,
    });
  });

  const targets = [];
  root.querySelectorAll("button, input, select, textarea, [role=button]").forEach((el) => {
    if (!visible(el)) return;
    if (el.type === "hidden" || el.type === "file") return;
    const r = el.getBoundingClientRect();
    targets.push({ sel: shortSel(el), text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), w: r.width, h: r.height });
  });

  const overflows = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth) overflows.push({ sel: "html", kind: "page-horizontal-scroll", px: de.scrollWidth - de.clientWidth });
  root.querySelectorAll("*").forEach((el) => {
    if (!visible(el) || !textOf(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5) overflows.push({ sel: shortSel(el), kind: "beyond-window-right", px: r.right - vw });
    if (r.left < -0.5) overflows.push({ sel: shortSel(el), kind: "beyond-window-left", px: -r.left });
    if (stage && stage.contains(el) && el !== stage) {
      const sr = stage.getBoundingClientRect();
      if (r.right > sr.right + 0.5) overflows.push({ sel: shortSel(el), kind: "clipped-by-stage-right", px: r.right - sr.right });
      if (r.left < sr.left - 0.5) overflows.push({ sel: shortSel(el), kind: "clipped-by-stage-left", px: sr.left - r.left });
    }
    const cs = getComputedStyle(el);
    const clips = cs.overflowX === "hidden" || cs.overflowX === "clip";
    if (clips && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1) {
      overflows.push({ sel: shortSel(el), kind: "text-clipped-silently", px: el.scrollWidth - el.clientWidth });
    }
  });

  return { viewport: { w: vw, h: vh }, texts, targets, overflows };
}

/* ---------- côté Node : couleurs et contraste (WCAG 2.x) ---------- */
function parseColor(str) {
  if (typeof str !== "string") return null;
  let m = str.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = str.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] };
  return null;
}

function composite(fg, bg) {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (f, b) => (f * fg.a + b * bg.a * (1 - fg.a)) / a;
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

function luminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Couleurs d'arrière-plan possibles derrière un texte. Un dégradé donne plusieurs candidats :
// on retient le pire cas. Renvoie null si rien de fiable (arrière-plan indéterminé).
function backgroundCandidates(chain) {
  const layers = []; // du plus proche du texte au plus lointain
  let base = null;
  for (const layer of chain) {
    const c = parseColor(layer.color);
    if (layer.image) {
      const stops = (layer.image.match(/rgba?\([^)]*\)/g) || []).map(parseColor).filter(Boolean);
      if (stops.length) { base = stops; layers.push(null); break; }
    }
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 1) { base = [c]; break; }
    }
  }
  if (!base) base = [{ r: 255, g: 255, b: 255, a: 1 }]; // page sans fond : blanc du navigateur
  return base.map((b) => {
    let acc = b;
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i]) acc = composite(layers[i], acc);
    return acc;
  });
}

function textContrast(entry) {
  const fg = parseColor(entry.color);
  if (!fg) return null;
  const alpha = fg.a * (entry.opacity === undefined ? 1 : entry.opacity);
  let worst = Infinity;
  for (const bg of backgroundCandidates(entry.bg)) {
    const opaqueBg = { ...bg, a: 1 };
    const eff = composite({ ...fg, a: alpha }, opaqueBg);
    worst = Math.min(worst, contrastRatio(eff, opaqueBg));
  }
  return worst === Infinity ? null : worst;
}

/* ---------- verdict ---------- */
function round(n, d = 2) { const p = 10 ** d; return Math.round(n * p) / p; }

function evaluateMetrics(metrics, thresholds, scope) {
  const out = [];
  const add = (v) => out.push(v);
  const t = thresholds;

  for (const e of metrics.texts) {
    const stageText = scope === "stage" && e.inStage;
    let minPx, minContrast, severity, where;
    if (stageText && e.kind === "lyric") { minPx = t.stage.minLyricPx; minContrast = t.stage.minContrast; severity = "error"; where = "paroles (lecteur)"; }
    else if (stageText && e.kind === "chord") { minPx = t.stage.minChordPx; minContrast = t.stage.minContrast; severity = "error"; where = "accords (lecteur)"; }
    else { minPx = t.chrome.minTextPx; minContrast = t.chrome.minContrast; severity = "warning"; where = "interface"; }

    if (e.fontPx < minPx - 0.01) {
      add({ rule: "font-size", severity, selector: e.sel, sample: e.text, value: round(e.fontPx, 1), threshold: minPx, message: `${where} : texte de ${round(e.fontPx, 1)} px (minimum ${minPx} px)` });
    }
    const c = textContrast(e);
    if (c !== null && c < minContrast) {
      add({ rule: "contrast", severity, selector: e.sel, sample: e.text, value: round(c), threshold: minContrast, message: `${where} : contraste ${round(c)}:1 (minimum ${minContrast}:1)` });
    }
  }

  for (const g of metrics.targets) {
    const m = Math.min(g.w, g.h);
    if (m < t.chrome.minTargetPx - 0.01) {
      add({ rule: "target-size", severity: "warning", selector: g.sel, sample: g.text, value: round(m, 1), threshold: t.chrome.minTargetPx, message: `commande de ${round(g.w, 1)}×${round(g.h, 1)} px (minimum ${t.chrome.minTargetPx} px de côté)` });
    }
  }

  for (const o of metrics.overflows) {
    if (o.px <= t.overflow.tolerancePx) continue;
    const severity = o.kind.startsWith("clipped-by-stage") || o.kind === "page-horizontal-scroll" ? "error" : "warning";
    add({ rule: "overflow", severity, selector: o.sel, sample: o.kind, value: round(o.px, 1), threshold: t.overflow.tolerancePx, message: `débordement (${o.kind}) de ${round(o.px, 1)} px` });
  }
  return groupViolations(out);
}

// Regroupe les occurrences identiques (même règle + même sélecteur) : 40 mots trop petits = 1 ligne.
function groupViolations(list) {
  const map = new Map();
  for (const v of list) {
    const key = `${v.rule}|${v.severity}|${v.selector}|${v.sample && v.rule === "overflow" ? v.sample : ""}`;
    const prev = map.get(key);
    if (!prev) { map.set(key, { ...v, count: 1 }); continue; }
    prev.count++;
    const worse = v.rule === "contrast" || v.rule === "font-size" || v.rule === "target-size" ? v.value < prev.value : v.value > prev.value;
    if (worse) { prev.value = v.value; prev.message = v.message; prev.sample = v.sample; }
  }
  return [...map.values()].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

module.exports = { collectMetrics, evaluateMetrics, parseColor, composite, luminance, contrastRatio, backgroundCandidates, textContrast, groupViolations };
