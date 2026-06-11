# AzaelRaid 🗡️

Bot Discord de gestion des raids viewers — vote, inscriptions, rôle provisoire, rappels et groupes.

## Installation

```bash
cd AzaelRaid
npm install
cp .env.example .env
# Remplis les variables dans .env
```

## Configuration (.env)

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token du bot (Discord Developer Portal) |
| `CLIENT_ID` | ID de l'application bot |
| `GUILD_ID` | ID de ton serveur Discord |
| `VOTE_CHANNEL_ID` | Canal où le sondage de vote est posté |
| `RAID_CHANNEL_ID` | Canal où les inscriptions et groupes sont affichés |
| `LOG_CHANNEL_ID` | Canal admin pour les logs de switch / kick |
| `ADMIN_ROLE_IDS` | IDs des rôles autorisés à utiliser /raid (séparés par virgule) |

## Démarrage

```bash
# Déployer les commandes slash (une seule fois ou après modification)
npm run deploy

# Lancer le bot
npm start
```

## Commandes

| Commande | Permission | Description |
|---|---|---|
| `/raid` | Admin/Modo | Lance le setup interactif (créneaux + date fin vote) |
| `/raid-kick @joueur` | Admin/Modo | Retire un joueur des inscriptions |
| `/raid-groupes` | Admin/Modo | Génère et affiche les groupes équilibrés |
| `/raid-cancel` | Admin/Modo | Annule le raid en cours et supprime le rôle |

## Flow complet

1. **Admin tape `/raid`** → modal s'ouvre (créneaux à proposer + date de fin du vote)
2. **Sondage posté** → les joueurs votent pour un créneau ET choisissent classe + rôle
3. **À la date de fin** → le bot clôture automatiquement le vote :
   - Créneau gagnant déterminé
   - Event Discord créé automatiquement
   - Rôle provisoire `Raider du JJ/MM/AAAA` créé et assigné aux votants du créneau gagnant
   - Message d'inscriptions posté avec boutons "Modifier mon perso" / "Se désinscrire"
4. **Les joueurs peuvent switcher librement** leur perso/rôle via le bouton (log en canal admin)
5. **H-30 avant le raid** → rappel automatique mentionnant le rôle provisoire
6. **Le lendemain à 2h** → rôle provisoire supprimé automatiquement

## Intents requis (Discord Developer Portal)

- `GUILDS`
- `GUILD_MEMBERS` *(Privileged — à activer manuellement)*
- `GUILD_SCHEDULED_EVENTS`

## Hébergement recommandé

- **VPS** (OVH, Hetzner, etc.) avec `pm2` pour le maintenir en vie : `pm2 start src/index.js --name azaelraid`
- **Railway / Render** (plan gratuit suffisant pour un petit serveur)
