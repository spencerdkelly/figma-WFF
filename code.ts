// ======================================================
//  WFF Setup — Figma Plugin Backend (stable version)
// ======================================================

console.log("PLUGIN VERSION: 5.6");

const TARGET = "[Company Name]";

// US ↔ UK spelling maps
const US_TO_UK: { [key: string]: string } = {
  "color": "colour",
  "organize": "organise",
  "organization": "organisation",
  "analyze": "analyse",
  "center": "centre",
  "fulfil": "fulfill",
  "labor": "labour",
  "specialize": "specialise",
  "specialised": "specialized"
};

const UK_TO_US: { [key: string]: string } = {
  "colour": "color",
  "organise": "organize",
  "organisation": "organization",
  "analyse": "analyze",
  "centre": "center",
  "fulfill": "fulfil",
  "labour": "labor",
  "specialise": "specialize",
  "specialised": "specialized"
};

figma.showUI(__html__, { width: 350, height: 400 });

//Case matching helper function
function matchCase(source: string, target: string): string {
  // ALL CAPS
  if (source === source.toUpperCase()) {
    return target.toUpperCase();
  }

  // Capitalised (Title Case)
  if (source[0] === source[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
  }

  // Default: lowercase
  return target.toLowerCase();
}


figma.ui.onmessage = async (msg) => {
  // This is how Figma actually delivers pluginMessage:
  // msg = { type, value, locale }
  console.log("RAW MESSAGE:", msg);

  if (!msg || msg.type !== "replace") {
    return;
  }

  const replacement = msg.value.trim();
  const locale = msg.locale || "us";
  const contractor = msg.contractor.trim() || "";
  const vms = msg.vms.trim() || "";


  if (!replacement) {
    figma.ui.postMessage({ type: "done" });
    return;
  }

  // REQUIRED for dynamic-page access
  await figma.loadAllPagesAsync();

  const slug = replacement.toLowerCase().replace(/\s+/g, "");

  const textNodes = figma.root.findAll(
    (n) => n.type === "TEXT"
  ) as TextNode[];

  // Pre-compile regexes
  const escapedTarget = TARGET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenRegex = new RegExp(escapedTarget, "g");
  const companyRegex = /companyname/g;
  const contractorRegex = /\bcontractor\b/gi;
  const contractorsRegex = /\bcontractors\b/gi;

  const localeMap = locale === "uk" ? US_TO_UK : UK_TO_US;
  const localeKeys = Object.keys(localeMap).join("|");

  // Non-global regex for checking
  const localeTestRegex = new RegExp("\\b(" + localeKeys + ")\\b", "i");

  // Global regex for replacing
  const localeReplaceRegex = new RegExp("\\b(" + localeKeys + ")\\b", "gi");

  for (const node of textNodes) {
    const original = node.characters;
    if (!original || original.length === 0) continue;

    const lower = original.toLowerCase();

    const needsCompany =
      original.indexOf(TARGET) !== -1 || lower.indexOf("companyname") !== -1;
    const needsContractor = lower.includes("contractor") || lower.includes("contractors");
    const needsLocale = localeTestRegex.test(lower);
    const needsVms = lower.includes("vms");

    if (!needsCompany && !needsLocale && !needsContractor && !needsVms) continue;


    const fontsOk = await loadAllFontsInNode(node);
    if (!fontsOk) continue;

    let updated = original;

    // Stage 1 — Company name replacement
    figma.ui.postMessage({ type: "progress", stage: "company" });

    if (updated.indexOf(TARGET) !== -1) {
      updated = updated.replace(tokenRegex, replacement);
    }
    if (updated.toLowerCase().indexOf("companyname") !== -1) {
      updated = updated.replace(companyRegex, slug);
    }

    // Stage 1b — Contractor replacement
    if (contractor) {
      const contractorLower = contractor.toLowerCase();

      figma.ui.postMessage({
        type: "progress",
        stage: "contractor",
        name: contractorLower
      });

      // Plural first
      updated = updated.replace(/\bcontractors\b/gi, (match) => {
        const plural = contractorLower + "s";
        return matchCase(match, plural);
      });

      // Singular
      updated = updated.replace(/\bcontractor\b/gi, (match) => {
        return matchCase(match, contractorLower);
      });
    }

    // VMS replacement (NO case matching)
    if (vms) {
      figma.ui.postMessage({
        type: "progress",
        stage: "vms",
        name: vms
      });

      updated = updated.replace(/\bvms\b/gi, vms);
    }


    // Stage 2 — Locale conversion
    figma.ui.postMessage({ type: "progress", stage: "locale" });

    updated = updated.replace(localeReplaceRegex, (match) => {
      const key = match.toLowerCase();
      return localeMap[key] || match;
    });

    if (updated !== original) {
      node.characters = updated;
    }
  }

  figma.ui.postMessage({ type: "done" });
};

// ======================================================
//  Font Loader — Skips nodes with unloadable fonts
// ======================================================

async function loadAllFontsInNode(node: TextNode): Promise<boolean> {
  const len = node.characters.length;
  if (len === 0) return true;

  let fonts: FontName[];
  try {
    fonts = node.getRangeAllFontNames(0, len);
  } catch (e) {
    return false;
  }

  const unique: FontName[] = [];
  for (let i = 0; i < fonts.length; i++) {
    const f = fonts[i];
    let exists = false;
    for (let j = 0; j < unique.length; j++) {
      const u = unique[j];
      if (u.family === f.family && u.style === f.style) {
        exists = true;
        break;
      }
    }
    if (!exists) unique.push(f);
  }

  for (let i = 0; i < unique.length; i++) {
    const font = unique[i];

    // Early skip for known problematic fonts
    if (font.family.indexOf("RNHouseSansW01") !== -1) return false;

    try {
      await figma.loadFontAsync(font);
    } catch (e) {
      return false;
    }
  }

  return true;
}
