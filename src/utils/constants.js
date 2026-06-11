const WOW_CLASSES = [
  { name: 'Guerrier',    emoji: '⚔️',  roles: ['Tank', 'DPS'] },
  { name: 'Paladin',     emoji: '🛡️',  roles: ['Tank', 'Heal', 'DPS'] },
  { name: 'Chasseur',    emoji: '🏹',  roles: ['DPS'] },
  { name: 'Voleur',      emoji: '🗡️',  roles: ['DPS'] },
  { name: 'Prêtre',      emoji: '✨',  roles: ['Heal', 'DPS'] },
  { name: 'Chaman',      emoji: '🌊',  roles: ['Heal', 'DPS'] },
  { name: 'Mage',        emoji: '🔥',  roles: ['DPS'] },
  { name: 'Démoniste',   emoji: '💀',  roles: ['DPS'] },
  { name: 'Moine',       emoji: '👊',  roles: ['Tank', 'Heal', 'DPS'] },
  { name: 'Druide',      emoji: '🌿',  roles: ['Tank', 'Heal', 'DPS'] },
  { name: 'Chevalier de la mort', emoji: '☠️', roles: ['Tank', 'DPS'] },
  { name: 'Chasseur de démons',   emoji: '👁️', roles: ['Tank', 'DPS'] },
  { name: 'Évocateur',   emoji: '🐉',  roles: ['Heal', 'DPS'] },
];

const ROLE_EMOJIS = {
  Tank: '🛡️',
  Heal: '💚',
  DPS:  '⚔️',
};

const COLORS = {
  vote:      0x9b59b6,
  open:      0x2ecc71,
  reminder:  0xe67e22,
  closed:    0x95a5a6,
  cancelled: 0xe74c3c,
};

module.exports = { WOW_CLASSES, ROLE_EMOJIS, COLORS };
