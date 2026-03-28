const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Fetching current guild (/) commands...');
        const commands = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID));
        if (commands.length === 0) {
            console.log('No guild commands to delete.');
            return;
        }
        for (const command of commands) {
            await rest.delete(`${Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)}/${command.id}`);
            console.log(`Deleted guild command: ${command.name}`);
        }
        console.log('All guild commands deleted.');
    } catch (error) {
        console.error(error);
    }
})();
