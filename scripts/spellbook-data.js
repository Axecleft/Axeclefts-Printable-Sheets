// Axecleft's Printable Sheets: a two-column spellbook (or power book) in the Player's Handbook layout.
// Each spell gets the PHB stat block worked out for its caster (caster level, save DC, range, duration, area, targets),
// then its full description. Works on Foundry 11 (D35E 2.4) and 13–14 (D35E 3.x): it reads the spell items and the
// spellbooks D35E keeps on the actor, and works the numbers out the way D35E does when the spell is cast.
import { t as tx } from "./i18n.js";

const num = v => (typeof v === "number" ? v : Number(v) || 0);
const sign = v => (num(v) >= 0 ? `+${num(v)}` : `${num(v)}`);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ord = n => { const v = num(n), t = v % 100; return `${v}${(t >= 11 && t <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[v % 10] ?? "th")}`; };
const cap = s => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);
const getProp = (o, path) => String(path).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);

// English names for D35E's keys, when the game's own labels aren't there (tests, missing translations)
const SCHOOLS = { abj: /*t*/"Abjuration", con: /*t*/"Conjuration", div: /*t*/"Divination", enc: /*t*/"Enchantment", evo: /*t*/"Evocation", ill: /*t*/"Illusion",
  nec: /*t*/"Necromancy", trs: /*t*/"Transmutation", uni: /*t*/"Universal", cla: /*t*/"Clairsentience", met: /*t*/"Metacreativity", psk: /*t*/"Psychokinesis",
  psp: /*t*/"Psychoportation", tel: /*t*/"Telepathy", pmb: /*t*/"Psychometabolism", kin: /*t*/"Psychokinesis", por: /*t*/"Psychoportation", bol: /*t*/"Psychometabolism" };
const ACTIVATION = { standard: [/*t*/"standard action", /*t*/"standard actions"], full: [/*t*/"full-round action", /*t*/"full-round actions"],
  swift: [/*t*/"swift action", /*t*/"swift actions"], immediate: [/*t*/"immediate action", /*t*/"immediate actions"], free: [/*t*/"free action", /*t*/"free actions"],
  move: [/*t*/"move action", /*t*/"move actions"], round: [/*t*/"round", /*t*/"rounds"], minute: [/*t*/"minute", /*t*/"minutes"], hour: [/*t*/"hour", /*t*/"hours"],
  day: [/*t*/"day", /*t*/"days"], attack: [/*t*/"attack action", /*t*/"attack actions"], special: [/*t*/"special", /*t*/"special"] };
const PERIODS = { round: [/*t*/"round", /*t*/"rounds"], roundPerLevel: [/*t*/"round", /*t*/"rounds"], minute: [/*t*/"minute", /*t*/"minutes"], minutePerLevel: [/*t*/"minute", /*t*/"minutes"],
  hour: [/*t*/"hour", /*t*/"hours"], hourPerLevel: [/*t*/"hour", /*t*/"hours"], day: [/*t*/"day", /*t*/"days"], month: [/*t*/"month", /*t*/"months"], year: [/*t*/"year", /*t*/"years"],
  turn: [/*t*/"turn", /*t*/"turns"], rounds: [/*t*/"round", /*t*/"rounds"] };
const RANGES = { personal: /*t*/"Personal", touch: /*t*/"Touch", close: /*t*/"Close", medium: /*t*/"Medium", long: /*t*/"Long", unlimited: /*t*/"Unlimited",
  seeText: /*t*/"See text", spec: /*t*/"See text" };
const SAVES = { willhalf: /*t*/"Will half", willnegates: /*t*/"Will negates", willpartial: /*t*/"Will partial", reflexhalf: /*t*/"Reflex half",
  reflexnegates: /*t*/"Reflex negates", reflexpartial: /*t*/"Reflex partial", fortitudehalf: /*t*/"Fortitude half",
  fortitudenegates: /*t*/"Fortitude negates", fortitudepartial: /*t*/"Fortitude partial" };
// The Player's Handbook's short class names ("Sor/Wiz 3")
const CLASS_SHORT = { adept: /*t*/"Adp", bard: /*t*/"Brd", cleric: /*t*/"Clr", druid: /*t*/"Drd", paladin: /*t*/"Pal", ranger: /*t*/"Rgr", sorcerer: /*t*/"Sor",
  wizard: /*t*/"Wiz", "sorcerer/wizard": /*t*/"Sor/Wiz", "psion/wilder": /*t*/"Psion/Wilder" };

/** D35E's label for a key (localized), else the English fallback. */
function label(table, key, fallback) {
  const k = table?.[key];
  if (k) { try { const s = game.i18n.localize(k); if (s && s !== k) return s; } catch (e) { /* no game */ } }
  return fallback ? tx(fallback) : (key ?? "");
}

/**
 * A D35E formula worked out with the caster's numbers ("10 + @sl + @ablMod", "1*@cl", "min(10, @cl)").
 * Returns null when it can't be worked out (dice, unknown words), so the printed text falls back to the spell's own.
 */
export function evalFormula(formula, data) {
  if (formula === null || formula === undefined) return null;
  if (typeof formula === "number") return formula;
  let f = String(formula).trim();
  if (!f) return null;
  f = f.replace(/@([a-zA-Z_][\w.]*)/g, (_, p) => { const v = getProp(data, p); return Number.isFinite(Number(v)) ? `(${Number(v)})` : "(0)"; });
  if (/\d\s*d\s*\d/i.test(f)) return null;
  const words = f.match(/[a-zA-Z_]+/g) ?? [];
  if (words.some(w => !["min", "max", "floor", "ceil", "round", "abs"].includes(w))) return null;
  if (/[^\d+\-*/()., a-z_]/i.test(f)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function("min", "max", "floor", "ceil", "round", "abs", `return (${f});`)(Math.min, Math.max, Math.floor, Math.ceil, Math.round, Math.abs);
    return Number.isFinite(v) ? Math.floor(v) : null;
  } catch (e) { return null; }
}

/**
 * Per-level wording in a spell's text worked out for its caster level: "1 round/level" becomes "7 rounds (1 round/level)",
 * "25 ft. + 5 ft./2 levels" becomes "40 ft.". Only plain cases; anything else is left as written.
 */
export function perLevel(text, cl) {
  if (!text || !(cl > 0)) return text ?? "";
  const units = "(rounds?|min\\.|minutes?|hours?|hrs?\\.?|days?|ft\\.|feet|miles?|creatures?|objects?|cu\\.? ft\\.|\\d+-ft\\.? cubes?|HD)";
  const re = new RegExp(`\\b(\\d+)\\s*${units}\\s*/\\s*(2\\s+)?(caster\\s+)?levels?\\b`, "gi");
  return String(text).replace(re, (m, n, unit, two) => {
    const v = num(n) * (two ? Math.floor(cl / 2) : cl);
    const u = /^(round|minute|hour|day|creature|object|mile)s?$/i.test(unit) ? (v === 1 ? unit.replace(/s$/i, "") : unit.replace(/s?$/i, "s")) : unit;
    return `${v} ${u} (${m.replace(/\s*\/\s*/, "/")})`;
  });
}

/** The spell's own description text, ready to print: Foundry links and inline rolls become plain words. */
export function cleanDescription(html) {
  let s = String(html ?? "");
  // A spell whose full description holds D35E's generated stat block: keep only the text after it
  s = s.replace(/<div class="spell-description">[\s\S]*?<\/p>\s*/i, "").replace(/<h2>\s*Description\s*<\/h2>/i, "");
  s = s.replace(/@(UUID|Compendium|Item|Actor|JournalEntry|RollTable|Macro)\[[^\]]*\]\{([^}]*)\}/g, "<i>$2</i>")
       .replace(/@(UUID|Compendium|Item|Actor|JournalEntry|RollTable|Macro)\[([^\]]*)\]/g, (_, __, p) => `<i>${esc(String(p).split(".").pop())}</i>`)
       .replace(/\[\[\/(?:r|roll|gmr|br|sr)\s+([^\]]*?)(?:\s*#[^\]]*)?\]\](?:\{([^}]*)\})?/g, (_, f, l) => l || f)
       .replace(/\[\[([^\]]*)\]\]/g, "$1")
       .replace(/<img[^>]*>/gi, "")
       .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "")
       .replace(/\son\w+="[^"]*"/gi, "")
       .replace(/<p>\s*(&nbsp;|\s)*\s*<\/p>/gi, "")
       .replace(/\n{2,}/g, "\n").trim();
  return s;
}

/** "Sor/Wiz 3, Fire 4" from D35E's learnedAt (class and domain lists of [name, level]). */
function levelLine(sys, fallbackLevel, bookName) {
  const parts = [];
  const cls = (sys.learnedAt?.class ?? []).filter(o => Array.isArray(o) && o[0]);
  // Sorcerer and Wizard at the same level read "Sor/Wiz 3", as in the Player's Handbook
  const byLevel = new Map();
  for (const [n, l] of cls) {
    const k = String(n).toLowerCase();
    if (k === "sorcerer" || k === "wizard") { const s = byLevel.get(l) ?? new Set(); s.add(k); byLevel.set(l, s); }
  }
  const done = new Set();
  for (const [n, l] of cls) {
    const k = String(n).toLowerCase();
    if ((k === "sorcerer" || k === "wizard") && byLevel.get(l)?.size === 2) {
      if (!done.has(`sw${l}`)) { parts.push(`${tx("Sor/Wiz")} ${l}`); done.add(`sw${l}`); }
      continue;
    }
    parts.push(`${CLASS_SHORT[k] ? tx(CLASS_SHORT[k]) : n} ${l}`);
  }
  for (const key of ["domain", "subDomain"]) for (const o of sys.learnedAt?.[key] ?? []) if (Array.isArray(o) && o[0]) parts.push(`${o[0]} ${o[1]}`);
  if (!parts.length) parts.push(`${bookName} ${fallbackLevel}`);
  return [...new Set(parts)].sort((a, b) => a.localeCompare(b)).join(", ");
}

/** "V, S, M (a tiny ball of bat guano and sulfur)", as D35E builds it. */
function componentsLine(sys) {
  const c = sys.components ?? {}, m = sys.materials ?? {};
  const df = num(c.divineFocus);
  const out = [];
  if (c.verbal) out.push("V");
  if (c.somatic) out.push("S");
  if (c.material) out.push(`${df === 2 ? "M/DF" : "M"}${m.value ? ` (${m.value})` : ""}`);
  if (c.focus) out.push(`${df === 3 ? "F/DF" : "F"}${m.focus ? ` (${m.focus})` : ""}`);
  if (df === 1) out.push("DF");
  if (c.value) out.push(...String(c.value).split(/[;,]/).map(s => s.trim()).filter(Boolean));
  if (num(sys.xpCost) > 0) out.push(tx("XP ({n} XP)", { n: sys.xpCost }));
  return out.join(", ");
}

function castingTime(sys) {
  const a = sys.activation ?? {};
  if (!a.type) return "";
  const n = a.cost ?? 1;
  const fb = ACTIVATION[a.type] ?? [a.type, a.type];
  let name = n === 1 ? label(CONFIG?.D35E?.abilityActivationTypes, a.type, fb[0]) : label(CONFIG?.D35E?.abilityActivationTypesPlurals, a.type, fb[1]);
  name = String(name).toLowerCase();
  return n ? `${n} ${name}` : name;
}

/** Range worked out for the caster level: "Long (720 ft.)", "Close (40 ft.)", "Touch", "60 ft.". */
function rangeLine(sys, cl, data) {
  const r = sys.range ?? {};
  const u = r.units;
  if (!u || u === "none") return "";
  if (u === "close") return tx("Close ({n} ft.)", { n: 25 + 5 * Math.floor(cl / 2) });
  if (u === "medium") return tx("Medium ({n} ft.)", { n: 100 + 10 * cl });
  if (u === "long") return tx("Long ({n} ft.)", { n: 400 + 40 * cl });
  if (u === "ft" || u === "mi") {
    const v = evalFormula(r.value, data);
    if (v === null) return r.value ? perLevel(`${r.value} ${u === "ft" ? "ft." : "miles"}`, cl) : "";
    if (!v) return "";
    return tx(u === "ft" ? /*t*/"{n} ft." : (v === 1 ? /*t*/"{n} mile" : /*t*/"{n} miles"), { n: v });
  }
  if (u === "spec" && r.value) return perLevel(String(r.value), cl);
  return label(CONFIG?.D35E?.distanceUnits, u, RANGES[u] ?? cap(u));
}

/** Duration worked out for the caster level: "7 rounds (1 round/level)", "70 minutes (10 min./level) (D)". */
function durationLine(sys, cl, data) {
  const text = String(sys.spellDuration ?? "").replace(/\s+/g, " ").trim();
  const dd = sys.spellDurationData ?? {};
  const dism = !!dd.dismissable || /\(D\)/.test(text);
  const bare = text.replace(/\s*\(D\)\s*/g, " ").trim();
  let out = "";
  if (/PerLevel$/.test(dd.units ?? "") && String(dd.value ?? "").includes("@cl")) {
    const v = evalFormula(dd.value, { ...data, cl });
    const p = PERIODS[dd.units] ?? [dd.units, dd.units];
    if (v !== null) out = `${v} ${tx(v === 1 ? p[0] : p[1])}${bare ? ` (${bare})` : ""}`;
  }
  if (!out) out = perLevel(bare, cl) || (dd.units ? label(CONFIG?.D35E?.timePeriodsSpells, dd.units, cap(dd.units)) : "");
  return out ? `${out}${dism ? " (D)" : ""}` : "";
}

/** "Reflex half (DC 17)", "Will negates (harmless) (DC 15)", "None". */
function saveLine(sys, dc) {
  const desc = sys.save?.type ? label(CONFIG?.D35E?.savingThrowTypes, sys.save.type, SAVES[sys.save.type] ?? sys.save.type)
                              : String(sys.save?.description ?? "").trim();
  if (!desc || /^none$/i.test(desc)) return tx("None");
  if (/see text/i.test(desc) && !/(fort|ref|will)/i.test(desc)) return desc;
  return dc ? `${desc} (${tx("DC {dc}", { dc })})` : desc;
}

/** The spells (or powers) of every spellbook that has any, grouped by level, with their stat blocks worked out. */
export function buildSpellbookData(actor, { rollData = null, t = s => s } = {}) {
  const src = actor?.toObject ? actor.toObject(false) : actor;
  const sys = src?.system ?? {};
  const books = sys.attributes?.spells?.spellbooks ?? {};
  const items = (src?.items ?? []).filter(i => i.type === "spell");
  let base = rollData;
  if (!base) { try { base = actor?.getRollData?.() ?? {}; } catch (e) { base = {}; } }
  base = base ?? {};
  const drain = num(sys.attributes?.energyDrain);
  const abilities = sys.abilities ?? {};

  const out = [];
  for (const [key, b] of Object.entries(books)) {
    const list = items.filter(i => (i.system?.spellbook ?? "primary") === key);
    if (!list.length) continue;
    const psionic = !!b.usePowerPoints || String(b.spellcastingType ?? "").toLowerCase() === "psionic" || list.every(i => i.system?.isPower);
    const abl = b.ability || "";
    const ablMod = abl ? num(abilities[abl]?.mod) : 0;
    const bookCl = num(b.cl?.total);
    const dcFormula = b.baseDCFormula || "10 + @sl + @ablMod";
    // The class's own name ("Wizard spells"), found by the tag the spellbook keeps ("wizard")
    const tagOf = n => String(n || "").replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
    const owner = b.class ? (src.items ?? []).find(c => c.type === "class" && tagOf(c.system?.customTag || c.name) === b.class) : null;
    const className = owner?.name ?? (b.class ? cap(b.class) : (key === "spelllike" ? "" : (b.name || cap(key))));
    

    const spells = list.map(i => {
      const s = i.system ?? {};
      const sl = num(s.level) + num(s.slOffset);
      const cl = Math.max(0, bookCl + num(s.clOffset) - drain);
      const data = { ...base, cl, sl, ablMod, item: s };
      const saveBase = evalFormula(s.save?.dc && String(s.save.dc) !== "0" ? s.save.dc : 0, data) ?? 0;
      const bookDc = evalFormula(dcFormula, data);
      const hasSave = !!(s.save?.type || (s.save?.description && !/^none$/i.test(String(s.save.description).trim())));
      const dc = hasSave && bookDc !== null ? saveBase + bookDc : null;
      const isPower = psionic || !!s.isPower;
      const school = label(CONFIG?.D35E?.spellSchools, s.school, SCHOOLS[s.school] ?? cap(s.school));
      const descriptors = String(s.types ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean);
      const sr = isPower ? s.pr : s.sr;
      const pp = num(s.powerPointsCost);
      const lines = [];
      const add = (lbl, val) => {
        const v = typeof val === "string" ? val.replace(/\s+/g, " ").replace(/\s+([;,.])/g, "$1").trim() : val;
        if (v !== "" && v !== null && v !== undefined && !lines.some(l => l.value === v && !l.isLevel)) lines.push({ label: tx(lbl), value: v, isLevel: lbl === "Level" });
      };
      add(/*t*/"Level", levelLine(s, sl, className || tx("Level")));
      if (isPower && s.display) add(/*t*/"Display", s.display);
      if (!isPower) add(/*t*/"Components", componentsLine(s));
      add(isPower ? /*t*/"Manifesting Time" : /*t*/"Casting Time", castingTime(s));
      add(/*t*/"Range", rangeLine(s, cl, data));
      add(/*t*/"Target", perLevel(String(s.target?.value ?? "").trim(), cl));
      add(/*t*/"Area", perLevel(String(s.spellArea ?? "").trim(), cl));
      add(/*t*/"Effect", perLevel(String(s.spellEffect ?? "").trim(), cl));
      add(/*t*/"Duration", durationLine(s, cl, data));
      if (s.range?.units !== "personal" || hasSave) {
        add(/*t*/"Saving Throw", saveLine(s, dc));
        add(isPower ? /*t*/"Power Resistance" : /*t*/"Spell Resistance", sr ? (isPower ? tx("Yes (manifester level check 1d20{n})", { n: sign(cl) }) : tx("Yes (caster level check 1d20{n})", { n: sign(cl) })) : tx("No"));
      }
      if (isPower && pp) add(/*t*/"Power Points", pp);
      const prepared = num(s.preparation?.preparedAmount);
      return {
        name: i.name, level: sl, cl, clNote: num(s.clOffset) ? tx("CL {cl}", { cl }) : "",
        school: school ? `${school}${s.subschool ? ` (${s.subschool})` : ""}${descriptors.length ? ` [${descriptors.join(", ")}]` : ""}` : "",
        lines, domain: !!(s.domain || s.isDomain || s.preparation?.domain),
        prepared: !psionic && prepared ? prepared : 0,
        description: cleanDescription(s.shortDescription || s.description?.value || "")
      };
    }).sort((a, z) => a.level - z.level || a.name.localeCompare(z.name));

    const levels = [];
    for (const sp of spells) {
      let l = levels.find(x => x.level === sp.level);
      if (!l) levels.push(l = { level: sp.level, title: sp.level === 0 ? (psionic ? tx("0-Level Powers") : tx("0-Level Spells (Cantrips and Orisons)"))
        : tx(psionic ? /*t*/"{ord}-Level Powers" : (key === "spelllike" ? /*t*/"{ord}-Level Spell-like Abilities" : /*t*/"{ord}-Level Spells"), { ord: ord(sp.level), n: sp.level }), spells: [] });
      l.spells.push(sp);
    }
    const ablName = abl ? abl.toUpperCase() : "";
    const facts = [
      bookCl ? tx(psionic ? /*t*/"Manifester level {ord}" : /*t*/"Caster level {ord}", { ord: ord(bookCl), n: bookCl }) : "",
      ablName ? `${tx(ablName)} ${num(abilities[abl]?.total ?? abilities[abl]?.value) || ""} (${sign(ablMod)})`.replace("  ", " ") : "",
      ablName && !psionic ? (dcFormula === "10 + @sl + @ablMod" ? tx("Save DC 10 + spell level {n}", { n: sign(ablMod) }) : tx("Save DC {formula}", { formula: dcFormula })) : "",
      psionic && num(b.powerPointsTotal) ? tx("Power points {n}", { n: num(b.powerPointsTotal) }) : "",
      b.concentration ? tx("Concentration {n}", { n: sign(b.concentration) }) : ""
    ].filter(Boolean);
    const kindText = psionic ? (className ? /*t*/"{name} powers" : /*t*/"Powers") : key === "spelllike" ? /*t*/"Spell-like Abilities" : (className ? /*t*/"{name} spells" : /*t*/"Spells");
    out.push({ key, title: tx(kindText, { name: className }).replace(/^./, c => c.toUpperCase()), psionic, facts, levels, count: spells.length });
  }
  const both = out.some(b => !b.psionic) && out.some(b => b.psionic);
  const subtitle = both ? tx("Spellbook and Power book") : out.some(b => b.psionic) ? tx("Power book") : tx("Spellbook");
  return { name: src?.name ?? "", subtitle, books: out, hasSpells: out.length > 0, printed: new Date().toLocaleDateString() };
}

/** Whether an actor has spells or powers to print. */
export const hasSpells = actor => !!actor?.items?.some?.(i => i.type === "spell");
