// Classes et rôles WoW avec restrictions par rôle

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

// Retourne les classes disponibles pour un rôle donné
function getClassesForRole(role) {
  if (role === "Tank") return TANKS;
  if (role === "Heal") return HEALS;
  return ALL_CLASSES;
}

const CLASS_EMOJI = {
  "Guerrier":              "⚔️",
  "Paladin":               "🔨",
  "Chasseur":              "🏹",
  "Voleur":                "🗡️",
  "Prêtre":                "✨",
  "Chevalier de la mort":  "💀",
  "Chaman":                "⚡",
  "Mage":                  "🔮",
  "Démoniste":             "🔥",
  "Moine":                 "🥋",
  "Druide":                "🌿",
  "Chasseur de démons":    "👁️",
  "Évocateur":             "🐉",
};

module.exports = { TANKS, HEALS, ALL_CLASSES, WOW_ROLES, CLASS_EMOJI, getClassesForRole };
