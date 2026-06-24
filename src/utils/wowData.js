const TANKS = ["Chevalier de la mort", "Paladin", "Guerrier", "Druide", "Chasseur de démons", "Moine"];
const HEALS = ["Évocateur", "Chaman", "Druide", "Prêtre", "Moine", "Paladin"];
const ALL_CLASSES = [
  "Guerrier", "Paladin", "Chasseur", "Voleur", "Prêtre",
  "Chevalier de la mort", "Chaman", "Mage", "Démoniste",
  "Moine", "Druide", "Chasseur de démons", "Évocateur"
];

const WOW_ROLES = [
  { label: "🛡️ Tank", value: "Tank" },
  { label: "💚 Heal", value: "Heal" },
  { label: "⚔️ DPS",  value: "DPS"  }
];

function getClassesForRole(role) {
  if (role === "Tank") return TANKS;
  if (role === "Heal") return HEALS;
  return ALL_CLASSES;
}

// Emojis couleur de classe WoW (unicode approchants des couleurs officielles)
// Remplacer les values par les IDs d'emojis custom du serveur si disponibles
// Format emoji custom Discord : <:nom:ID> ex: <:warrior:123456789>
const CLASS_EMOJI = {
  "Guerrier":              "🟠",  // marron/orange — Guerrier
  "Paladin":               "🟣",  // rose/violet — Paladin
  "Chasseur":              "🟢",  // vert — Chasseur
  "Voleur":                "🟡",  // jaune — Voleur
  "Prêtre":                "⬜",  // blanc — Prêtre
  "Chevalier de la mort":  "🔴",  // rouge — DK
  "Chaman":                "🔵",  // bleu — Chaman
  "Mage":                  "🩵",  // bleu clair — Mage
  "Démoniste":             "🟣",  // violet — Démoniste
  "Moine":                 "🟩",  // vert jade — Moine
  "Druide":                "🟠",  // orange — Druide
  "Chasseur de démons":    "🟪",  // violet néon — DH
  "Évocateur":             "🟢",  // vert émeraude — Évocateur
};

module.exports = { TANKS, HEALS, ALL_CLASSES, WOW_ROLES, CLASS_EMOJI, getClassesForRole };
