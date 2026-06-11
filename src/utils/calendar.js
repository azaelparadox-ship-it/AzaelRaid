const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { EMBED_COLORS, CUSTOM_IDS } = require('../utils/constants');

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TIMES = ['18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00'];

// État temporaire par utilisateur (en mémoire, pas besoin de BDD)
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    const now = new Date();
    sessions.set(userId, {
      step: 'pick_slots',       // pick_slots | pick_voteend | pick_time | done
      year: now.getFullYear(),
      month: now.getMonth(),
      selectedSlots: [],        // [{ date, time, label }]
      pendingDate: null,        // date sélectionnée, en attente de l'heure
      voteEndDate: null,
      title: 'Raid Viewer',
      maxPlayers: 20,
    });
  }
  return sessions.get(userId);
}

function clearSession(userId) { sessions.delete(userId); }

// ─── Construire l'embed calendrier ────────────────────────────────────────
function buildCalendarEmbed(session) {
  const { year, month, step, selectedSlots, voteEndDate } = session;
  const today = new Date(); today.setHours(0,0,0,0);

  let title, desc;
  if (step === 'pick_slots') {
    title = '📅 Créneaux du raid — Étape 1/2';
    desc = 'Sélectionnez **une ou plusieurs dates** pour le raid, puis choisissez l\'heure pour chacune.\n\n';
    if (selectedSlots.length > 0) {
      desc += '**Créneaux ajoutés :**\n' + selectedSlots.map(s => `✅ ${s.label}`).join('\n');
    } else {
      desc += '*Aucun créneau sélectionné pour l\'instant.*';
    }
  } else {
    title = '🗳️ Date de fin du vote — Étape 2/2';
    desc = 'Sélectionnez la date **jusqu\'à laquelle le vote sera ouvert**.\nLe sondage se clôturera automatiquement ce jour à minuit.\n\n';
    if (voteEndDate) desc += `✅ Fin du vote : **${formatDate(voteEndDate)} à minuit**`;
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.vote)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: `AzaelRaid • ${MONTHS[month]} ${year}` });

  return embed;
}

// ─── Construire les composants calendrier ─────────────────────────────────
function buildCalendarComponents(session) {
  const { year, month, step, selectedSlots, pendingDate } = session;
  const today = new Date(); today.setHours(0,0,0,0);
  const rows = [];

  // Rangée navigation mois
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.CAL_PREV).setLabel('◀ Mois préc.').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cal_month_label').setLabel(`${MONTHS[month]} ${year}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.CAL_NEXT).setLabel('Mois suiv. ▶').setStyle(ButtonStyle.Secondary),
  );
  rows.push(navRow);

  // Générer les jours du mois par semaines (max 4 rangées de 5 boutons)
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startDow = firstDay.getDay(); // 0=dim
  startDow = startDow === 0 ? 6 : startDow - 1; // convertir en lun=0

  const allDays = [];
  for (let i = 0; i < startDow; i++) allDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) allDays.push(d);

  // On prend les 3 premières semaines complètes visibles (max 3 rangées de 5 = 15 jours affichables)
  // Discord limite à 5 rangées total. On a: 1 nav + max 3 jours + 1 action = 5 rangées.
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  // Afficher au max 3 semaines (15 boutons sur 3 rangées de 5)
  // On prend les 5 premiers jours de chaque semaine uniquement (Lun→Ven + Sam + Dim tronqués)
  for (const week of weeks.slice(0, 3)) {
    const row = new ActionRowBuilder();
    const displayDays = week.slice(0, 5); // Lun-Ven
    displayDays.forEach(d => {
      if (!d) {
        row.addComponents(new ButtonBuilder().setCustomId(`cal_empty_${Math.random()}`).setLabel(' ').setStyle(ButtonStyle.Secondary).setDisabled(true));
        return;
      }
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const date = new Date(year, month, d);
      const isPast = date < today;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isSelected = step === 'pick_slots'
        ? selectedSlots.some(s => s.date === dateStr)
        : session.voteEndDate === dateStr;

      const customId = step === 'pick_slots'
        ? `${CUSTOM_IDS.CAL_DAY}${dateStr}`
        : `${CUSTOM_IDS.CAL_VOTEEND}${dateStr}`;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(`${d}`)
          .setStyle(isSelected ? ButtonStyle.Success : isWeekend ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(isPast)
      );
    });
    // Compléter si moins de 5 boutons
    while (row.components.length < 5) {
      row.addComponents(new ButtonBuilder().setCustomId(`cal_pad_${Math.random()}`).setLabel(' ').setStyle(ButtonStyle.Secondary).setDisabled(true));
    }
    rows.push(row);
  }

  // Rangée action finale
  if (step === 'pick_slots') {
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.CAL_CONFIRM)
        .setLabel(selectedSlots.length > 0 ? `✅ Continuer (${selectedSlots.length} créneau${selectedSlots.length > 1 ? 'x' : ''})` : '✅ Continuer')
        .setStyle(ButtonStyle.Success)
        .setDisabled(selectedSlots.length === 0),
    );
    rows.push(actionRow);
  } else {
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.CAL_CONFIRM)
        .setLabel(session.voteEndDate ? '🚀 Lancer le sondage !' : 'Sélectionnez une date')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!session.voteEndDate),
    );
    rows.push(actionRow);
  }

  return rows;
}

// ─── Sélecteur d'heure ────────────────────────────────────────────────────
function buildTimeSelect(dateStr) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CUSTOM_IDS.CAL_TIME_SEL}${dateStr}`)
    .setPlaceholder(`Heure pour le ${formatDate(dateStr)}...`)
    .addOptions(TIMES.map(t => ({ label: t, value: t })));

  return [new ActionRowBuilder().addComponents(select)];
}

// ─── Formatage ────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatSlotLabel(dateStr, time) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const dayName = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][date.getDay()];
  return `${dayName} ${d}/${m} à ${time}`;
}

module.exports = {
  getSession, clearSession,
  buildCalendarEmbed, buildCalendarComponents,
  buildTimeSelect, formatDate, formatSlotLabel,
};
