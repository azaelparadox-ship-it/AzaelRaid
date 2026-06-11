// Classes et rôles WoW — utilisés dans les menus déroulants

const WOW_CLASSES = [
  "Guerrier", "Paladin", "Chasseur", "Voleur", "Prêtre",
  "Chevalier de la mort", "Chaman", "Mage", "Démoniste",
  "Moine", "Druide", "Chasseur de démons", "Évocateur"
];

const WOW_ROLES = [
  { label: "🛡️ Tank",    value: "Tank" },
  { label: "💚 Heal",    value: "Heal" },
  { label: "⚔️ DPS",     value: "DPS"  }
];

// Couleur embed par rôle
const ROLE_COLORS = {
  Tank: 0x3498db,  // bleu
  Heal: 0x2ecc71,  // vert
  DPS:  0xe74c3c,  // rouge
};

// Émoji par classe
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

module.exports = { WOW_CLASSES, WOW_ROLES, ROLE_COLORS, CLASS_EMOJI };
