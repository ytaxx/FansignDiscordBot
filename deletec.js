const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Fetching current application (/) commands...');
        const commands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
        if (commands.length === 0) {
            console.log('No commands to delete.');
            return;
        }
        for (const command of commands) {
            await rest.delete(`${Routes.applicationCommands(process.env.CLIENT_ID)}/${command.id}`);
            console.log(`Deleted command: ${command.name}`);
        }
        console.log('All commands deleted.');
    } catch (error) {
        console.error(error);
    }
})();
