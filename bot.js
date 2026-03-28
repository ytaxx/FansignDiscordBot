
// main bot file
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, ActivityType, PresenceUpdateStatus } = require('discord.js');
require('dotenv').config();

// create client and command collection
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// load commands
const commandsPath = path.join(__dirname, 'commands');
const startLoad = Date.now();
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
console.log(`[INFO] Loading ${commandFiles.length} command files...`);
let loadedCount = 0;
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
            loadedCount++;
            console.log(`[COMMAND] Loaded: ${command.data.name} (${file})`);
        } else {
            console.warn(`[WARN] Invalid command file: ${file}`);
        }
    } catch (err) {
        console.error(`[ERROR] Failed to load command ${file}:`, err);
    }
}
console.log(`[INFO] Loaded ${loadedCount}/${commandFiles.length} commands in ${Date.now() - startLoad}ms.`);

// on ready, set presence
client.once('ready', () => {
    console.log(`[READY] Logged in as ${client.user.tag}`);
    let version = 'unknown';
    try {
        const configPath = path.join(__dirname, 'config', 'config.json');
        const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        version = appConfig.version || version;
    } catch (e) {}
    client.user.setPresence({
        status: "online",
        activities: [{ name: `${version}`, type: ActivityType.Streaming }],
    });
    console.log(`[STATUS] status created, bot running on version ${version}`);
});

// handle all interactions
client.on('interactionCreate', async interaction => {
    // block bot in dms
    if (!interaction.guildId) {
        if (interaction.isButton()) {
            await interaction.update({ content: 'This bot only works in servers. DMs are not supported.', components: [], embeds: [] });
        } else {
            await interaction.reply({ content: 'This bot only works in servers. DMs are not supported.', flags: 64 });
        }
        return;
    }
    // handle buttons (not slash commands)
    if (!interaction.isChatInputCommand()) {
        if (interaction.isButton() && (interaction.customId.startsWith('info_prev_') || interaction.customId.startsWith('info_next_'))) {
            const infoCommand = require('./commands/info.js');
            await infoCommand.handleButton(interaction);
        }
        return;
    }
    // ban check (allow /help and /info for banned)
    try {
        const banlistPath = path.join(__dirname, 'config', 'banlist.json');
        let banlist = [];
        if (fs.existsSync(banlistPath)) {
            try {
                banlist = JSON.parse(fs.readFileSync(banlistPath, 'utf8'));
            } catch (e) {
                banlist = [];
            }
        }
        const allowedWhileBanned = ['help', 'info'];
        let ban = banlist.find(b => b.userId === interaction.user.id);
        if (ban && !allowedWhileBanned.includes(interaction.commandName)) {
            // check expiry
            if (ban.expires && Date.now() > ban.expires) {
                // remove expired ban
                banlist = banlist.filter(b => b.userId !== interaction.user.id);
                try {
                    fs.writeFileSync(banlistPath, JSON.stringify(banlist, null, 2), 'utf8');
                } catch (e) {}
            } else {
                // ban active
                let remaining = '';
                if (ban.expires) {
                    const ms = ban.expires - Date.now();
                    const sec = Math.floor(ms / 1000) % 60;
                    const min = Math.floor(ms / 1000 / 60) % 60;
                    const hr = Math.floor(ms / 1000 / 60 / 60) % 24;
                    const day = Math.floor(ms / 1000 / 60 / 60 / 24);
                    let parts = [];
                    if (day > 0) parts.push(`${day}d`);
                    if (hr > 0) parts.push(`${hr}h`);
                    if (min > 0) parts.push(`${min}m`);
                    if (sec > 0) parts.push(`${sec}s`);
                    remaining = parts.length ? parts.join(' ') : 'less than 1s';
                } else {
                    remaining = 'never expires';
                }
                const banIdText = ban.banId ? ban.banId : 'N/A';
                await interaction.reply({ content: `This account is currently banned. <:BanHammer:1394344663481057300>\nReason: *${ban.reason}*\nBan expires in: *${remaining}*\nBan ID: *#${banIdText}*`, flags: 64 });
                console.log(`[BAN] Blocked command for banned user ${interaction.user.tag} (${interaction.user.id})`);
                return;
            }
        }
    } catch (e) {
        console.error('[BAN CHECK ERROR]', e);
    }
    // run command
    console.log(`[INTERACTION] ${interaction.user.tag} used /${interaction.commandName}`);
    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.warn(`[WARN] Command not found: ${interaction.commandName}`);
        return;
    }
    const execStart = Date.now();
    try {
        await command.execute(interaction);
        console.log(`[SUCCESS] /${interaction.commandName} executed in ${Date.now() - execStart}ms for ${interaction.user.tag}`);
    } catch (error) {
        console.error(`[ERROR] While executing /${interaction.commandName}:`, error);
        // Don't try to send error messages for unknown interactions
        if (error.code === 10062) return;
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '<:crossmark:1393755852221190205> There was an error while executing this command!', flags: 64 });
            } else {
                await interaction.reply({ content: '<:crossmark:1393755852221190205> There was an error while executing this command!', flags: 64 });
            }
        } catch (e) {
            console.error('[ERROR] Failed to send error message:', e);
        }
    }
});

// error and warn handlers
client.on('error', err => {
    console.error('[CLIENT ERROR]', err);
});

client.on('warn', info => {
    console.warn('[CLIENT WARN]', info);
});

// login
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('[LOGIN] Discord login successful.'))
    .catch(err => console.error('[LOGIN ERROR] Discord login failed:', err));
