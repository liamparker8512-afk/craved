require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in your .env file.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data) commands.push(command.data.toJSON());
}

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} slash command(s)...`);

    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ Deployed commands to guild ${GUILD_ID} (instant).`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Deployed commands globally (may take up to 1 hour to propagate).');
    }
  } catch (error) {
    console.error(error);
  }
})();
