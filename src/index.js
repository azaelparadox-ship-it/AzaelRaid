require("dotenv").config();
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const voteScheduler = require("./events/voteScheduler");
const interactionCreate = require("./events/interactionCreate");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents
  ]
});

// Charger les commandes
client.commands = new Collection();
const commands = [
  require("./commands/raid"),
  require("./commands/raidKick"),
  require("./commands/raidGroupes"),
  require("./commands/raidCancel")
];
commands.forEach(cmd => client.commands.set(cmd.data.name, cmd));

// Événements Discord
client.once("ready", () => {
  console.log(`✅ AzaelRaid connecté en tant que ${client.user.tag}`);
  voteScheduler.start(client);
});

client.on("interactionCreate", interaction =>
  interactionCreate.execute(interaction, client).catch(console.error)
);

client.login(process.env.DISCORD_TOKEN);
