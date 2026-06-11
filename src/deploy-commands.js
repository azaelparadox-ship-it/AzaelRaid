require("dotenv").config();
const { REST, Routes } = require("discord.js");

const commands = [
  require("./commands/raid"),
  require("./commands/raidKick"),
  require("./commands/raidGroupes"),
  require("./commands/raidCancel")
].map(cmd => cmd.data.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  console.log("Déploiement des commandes slash...");
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("✅ Commandes déployées !");
})();
