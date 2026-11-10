// Axecleft's Printable Sheets: translation. The texts are written in English and translated by Axecleft's Tools
// (lang/<code>.json, "English text": "translation", the same files as the other Axecleft modules). Without the Tools
// (an exported actor tested outside Foundry) the English is used, with its {placeholders} filled in.
export const MODULE_ID = "axeclefts-printable-sheets";
const fill = (text, data) => String(text ?? "").replace(/\{(\w+)\}/g, (m, k) => (data && data[k] !== undefined && data[k] !== null ? String(data[k]) : m));
/** "English text {name}" → the text in the world's language, else the English. */
export function t(text, data) {
  const A = globalThis.AxecleftTools;
  try { if (A?.t) return A.t(text, data); } catch (e) { /* fall back to the English */ }
  return fill(text, data);
}
// Read this module's lang/ files with the other Axecleft modules' (the Tools load them during "setup")
globalThis.AxecleftTools?.registerLanguageModule?.(MODULE_ID);
