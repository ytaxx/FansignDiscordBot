const { Client, GatewayIntentBits } = require('discord.js');

// Parse command line arguments
let input = null;
let token = null;

for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--token') {
        token = process.argv[i + 1];
        i++; // skip next argument
    } else if (!process.argv[i].startsWith('--')) {
        input = process.argv[i];
    }
}

if (!input) {
    process.stdout.write(JSON.stringify({ error: 'No input provided' }));
    process.exit(1);
}

if (!token) {
    process.stdout.write(JSON.stringify({ error: 'No token provided in command line arguments' }));
    process.exit(1);
}

// Debug info (first 10 chars of token for verification)
console.error('Debug: Token received (first 10 chars):', token.substring(0, 10));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', async () => {
    try {
        let found = null;
        for (const guild of client.guilds.cache.values()) {
            await guild.members.fetch();
            // if input is all digits, treat as ID
            if (/^\d+$/.test(input)) {
                const member = guild.members.cache.get(input);
                if (member) {
                    found = member;
                    break;
                }
            } else {
                const member = guild.members.cache.find(m => m.user.username.toLowerCase() === input.toLowerCase());
                if (member) {
                    found = member;
                    break;
                }
            }
        }
        if (found) {
            process.stdout.write(JSON.stringify({ id: found.user.id, username: found.user.username }));
            await client.destroy();
            process.exit(0);
        } else {
            process.stdout.write(JSON.stringify({ error: 'User not found' }));
            await client.destroy();
            process.exit(1);
        }
    } catch (e) {
        process.stdout.write(JSON.stringify({ error: e.message }));
        await client.destroy();
        process.exit(1);
    }
});

client.login(token);
