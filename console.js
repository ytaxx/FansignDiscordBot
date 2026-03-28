let botStatus = 'OFFLINE'; // bot status: offline, online, restarting
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// Verify token is loaded
if (!process.env.DISCORD_TOKEN) {
    console.error('Error: DISCORD_TOKEN not found in .env file');
    process.exit(1);
}

const banlistPath = path.join(__dirname, 'config', 'banlist.json');

// ansi color codes for console output
const color = {
    reset: '\x1b[0m',
    white: (txt) => `\x1b[37m${txt}\x1b[0m`,
    info: (txt) => `\x1b[33m${txt}\x1b[0m`,
    red: (txt) => `\x1b[31m${txt}\x1b[0m`,
    green: (txt) => `\x1b[32m${txt}\x1b[0m`,
    yellow: (txt) => `\x1b[33m${txt}\x1b[0m`,
    blue: (txt) => `\x1b[34m${txt}\x1b[0m`,
    magenta: (txt) => `\x1b[35m${txt}\x1b[0m`,
    cyan: (txt) => `\x1b[36m${txt}\x1b[0m`,
    bold: (txt) => `\x1b[1m${txt}\x1b[0m`,
    dim: (txt) => `\x1b[2m${txt}\x1b[0m`,
};

let botProcess = null;

const logBuffer = [];
// returns current time as hh:mm:ss
function getTimestamp(date = new Date()) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

// colorize log tag
function colorizeTag(tag) {
    switch (tag) {
        case 'INFO': return color.bold(color.yellow('[INFO]'));
        case 'COMMAND': return color.bold(color.green('[COMMAND]'));
        case 'LOGIN': return color.bold(color.cyan('[LOGIN]'));
        case 'READY': return color.bold(color.green('[READY]'));
        case 'STATUS': return color.bold(color.magenta('[STATUS]'));
        case 'ERROR': return color.bold(color.red('[ERROR]'));
        case 'BOT ERROR': return color.bold(color.red('[BOT ERROR]'));
        case 'RESTART': return color.bold(color.magenta('[RESTART]'));
        case 'LOG': return color.bold(color.cyan('[LOG]'));
        case 'CONSOLE': return color.bold(color.cyan('[CONSOLE]'));
        case 'HELP': return color.bold(color.blue('[HELP]'));
        case 'RELOAD': return color.bold(color.yellow('[RELOAD]'));
        case 'DEPLOY': return color.bold(color.blue('[DEPLOY]'));
        case 'BOT': return color.bold(color.green('[BOT]'));
        default: return color.bold(color.white(`[${tag}]`));
    }
}

// format a log entry for display
function formatLogEntry(entry) {
    let ts;
    if (entry && typeof entry === 'object' && entry.timestamp) {
        ts = getTimestamp(new Date(entry.timestamp));
    } else {
        ts = getTimestamp();
    }

    // Format timestamp with color
    const timestamp = color.bold(color.dim(`[${ts}]`));

    if (typeof entry === 'string') {
        // extract tag
        const tagMatch = entry.match(/^\[([A-Z ]+)\] ?(.*)$/);
        if (tagMatch) {
            const tag = tagMatch[1];
            let msg = tagMatch[2];

            // color specific message types
            if (msg.includes('command used')) {
                msg = color.dim(msg);
            } else if (msg.includes('error') || msg.includes('failed') || msg.includes('invalid')) {
                msg = color.red(msg);
            } else if (msg.includes('success') || msg.includes('completed')) {
                msg = color.green(msg);
            } else if (msg.includes('starting') || msg.includes('processing')) {
                msg = color.yellow(msg);
            }

            // yellow tag for console command used
            if (tag === 'CONSOLE' && /command used$/.test(msg)) {
                return `${timestamp} ${color.yellow('[CONSOLE]'.padEnd(13))} ${msg}`;
            }
            return `${timestamp} ${colorizeTag(tag).padEnd(13)} ${msg}`;
        } else {
            return `${timestamp} ${color.white(entry)}`;
        }
    } else if (entry && typeof entry === 'object' && entry.tag) {
        let msg = entry.msg;
        
        // Enhanced message coloring based on content
        if (entry.tag === 'INFO') {
            msg = color.cyan(msg);
        } else if (entry.tag === 'ERROR' || entry.tag === 'BOT ERROR') {
            msg = color.red(msg);
        } else if (entry.tag === 'HELP') {
            msg = color.cyan(msg);
        } else if (entry.tag === 'CONSOLE' && msg.includes('command used')) {
            msg = color.dim(msg);
        }

        return `${timestamp} ${colorizeTag(entry.tag).padEnd(13)} ${msg}`;
    } else if (entry && typeof entry === 'object' && entry.msg) {
        return `${timestamp} ${color.white(entry.msg)}`;
    } else {
        return `${timestamp} ${color.white(entry)}`;
    }
}

// add a log entry to buffer
function addLog(msg) {
    if (typeof msg === 'string') {
        logBuffer.push({ msg, timestamp: new Date() });
    } else if (msg && typeof msg === 'object' && !msg.timestamp) {
        logBuffer.push({ ...msg, timestamp: new Date() });
    } else {
        logBuffer.push(msg);
    }
    if (logBuffer.length > 40) logBuffer.shift();
}
// print all logs and header
function printLogs() {
    console.clear();
    // header with status
    let statusColor = color.red;
    if (botStatus === 'ONLINE') statusColor = color.green;
    else if (botStatus === 'RESTARTING') statusColor = color.yellow;
    const statusText = statusColor(botStatus.padEnd(9));
    console.log(
        '  ' + color.bold(color.cyan('╔══ YTAX BOT CONSOLE ══╗')) +
        color.magenta(' v3') +
        '  ' + color.blue(new Date().toLocaleDateString()) +
        '  ' + color.yellow(new Date().toLocaleTimeString()) +
        '  ' + statusText
    );
    // top border with fancy corners
    console.log(color.cyan('╔' + '═'.repeat(70) + '╗'));
    // log lines
    const logLines = logBuffer.length;
    for (let i = 0; i < logLines; i++) {
        console.log(formatLogEntry(logBuffer[i]));
        // separator for different tags
        if (i < logLines - 1) {
            const curr = logBuffer[i], next = logBuffer[i + 1];
            const currTag = typeof curr === 'string' && curr.match(/^\[([A-Z ]+)\]/) ? curr.match(/^\[([A-Z ]+)\]/)[1] : null;
            const nextTag = typeof next === 'string' && next.match(/^\[([A-Z ]+)\]/) ? next.match(/^\[([A-Z ]+)\]/)[1] : null;
            if (currTag && nextTag && currTag !== nextTag) {
                // More visible separator with different colors based on tags
                let sepColor = color.dim;
                if (currTag === 'ERROR' || nextTag === 'ERROR' || currTag === 'BOT ERROR' || nextTag === 'BOT ERROR') {
                    sepColor = color.red;
                } else if (currTag === 'SUCCESS' || nextTag === 'SUCCESS') {
                    sepColor = color.green;
                } else if (currTag === 'INFO' || nextTag === 'INFO') {
                    sepColor = color.yellow;
                }
                // Fancy separator with different styles based on tags
                let leftChar = '•', rightChar = '•';
                if (currTag === 'ERROR' || nextTag === 'ERROR' || currTag === 'BOT ERROR' || nextTag === 'BOT ERROR') {
                    leftChar = '✖'; rightChar = '✖';
                } else if (currTag === 'SUCCESS' || nextTag === 'SUCCESS') {
                    leftChar = '✓'; rightChar = '✓';
                } else if (currTag === 'INFO' || nextTag === 'INFO') {
                    leftChar = 'ℹ'; rightChar = 'ℹ';
                }
                console.log(sepColor(`${leftChar}━━${('═').repeat(64)}━━${rightChar}`));
            }
        }
    }
    // Fill remaining space
    for (let i = logLines; i < 40; i++) {
        console.log('');
    }
    // bottom border with fancy corners
    console.log(color.cyan('╚' + '═'.repeat(70) + '╝'));
    // command hint
    console.log(color.dim('  Type "help" for available commands'));
}

// show input prompt with arrow
function showPrompt() {
    process.stdout.write(color.bold(color.cyan('└─➤ ')));
}

function startBot() {
    if (botProcess) return;
    botStatus = 'ONLINE';
    botProcess = spawn(process.argv[0], ['--max-old-space-size=4096', path.join(__dirname, 'bot.js')], {
        cwd: process.cwd(),
        env: process.env
    });
    botProcess.stdout.on('data', (data) => {
        data.toString().split(/\r?\n/).forEach(line => {
            if (line.trim().length > 0) {
                // Process the bot output line to add colors
                const botLine = line.trim();
                if (botLine.includes('[LOGIN]')) {
                    addLog({ tag: 'BOT', msg: color.cyan(botLine) });
                } else if (botLine.includes('[INFO]')) {
                    addLog({ tag: 'BOT', msg: color.yellow(botLine) });
                } else if (botLine.includes('[COMMAND]')) {
                    addLog({ tag: 'BOT', msg: color.green(botLine) });
                } else if (botLine.includes('[READY]')) {
                    addLog({ tag: 'BOT', msg: color.green(botLine) });
                } else if (botLine.includes('[STATUS]')) {
                    addLog({ tag: 'BOT', msg: color.magenta(botLine) });
                } else if (botLine.includes('[ERROR]')) {
                    addLog({ tag: 'BOT', msg: color.red(botLine) });
                } else if (botLine.includes('dotenv')) {
                    addLog({ tag: 'BOT', msg: color.cyan(botLine) });
                } else {
                    addLog({ tag: 'BOT', msg: color.white(botLine) });
                }
                printLogs();
            }
        });
        showPrompt();
    });
    botProcess.stderr.on('data', (data) => {
        data.toString().split(/\r?\n/).forEach(line => {
            if (line.trim().length > 0) {
                addLog({ tag: 'BOT ERROR', msg: color.red(line.trim()) });
                printLogs();
            }
        });
        showPrompt();
    });
    botProcess.on('exit', (code, signal) => {
        botStatus = 'OFFLINE';
        addLog(`[RESTART] Bot process exited with code ${code}, signal ${signal}`);
        printLogs();
        botProcess = null;
    });
    printLogs();
    showPrompt();
}

function stopBot() {
    if (botProcess) {
        botStatus = 'OFFLINE';
        botProcess.kill();
        botProcess = null;
        printLogs();
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});


printLogs();
showPrompt();

rl.on('line', async (line) => {
    const input = line.trim();
    if (input.length === 0) {
        printLogs();
        showPrompt();
        return;
    }
    let resultMsg = '';
    if (input === 'start') {
        addLog({ tag: 'CONSOLE', msg: color.cyan('start command used') });
        if (botProcess) {
            addLog({ tag: 'CONSOLE', msg: color.yellow('Bot already running.') });
        } else {
            startBot();
            addLog({ tag: 'CONSOLE', msg: color.green('Bot started.') });
        }
    } else if (input === 'stop') {
        addLog({ tag: 'CONSOLE', msg: color.cyan('stop command used') });
        if (botProcess) {
            stopBot();
            addLog({ tag: 'CONSOLE', msg: color.red('Bot stopped.') });
        } else {
            addLog({ tag: 'CONSOLE', msg: color.yellow('Bot is not running.') });
        }
    } else if (input === 'restart') {
        addLog('[CONSOLE] restart command used');
        botStatus = 'RESTARTING';
        printLogs();
        stopBot();
        setTimeout(() => {
            startBot();
            addLog(color.magenta('RESTART') + ' Bot restarted.');
            printLogs();
            showPrompt();
        }, 500);
        addLog(color.magenta('RESTART') + ' Restarting bot...');
        printLogs();
        return;
    } else if (input === 'clear') {
        addLog('[CONSOLE] clear command used');
        logBuffer.length = 0;
        resultMsg = '[LOG] Log cleared.';
    } else if (input === 'info') {
        addLog('[CONSOLE] info command used');
        const mem = process.memoryUsage();
        const rss = (mem.rss / 1024 / 1024).toFixed(1);
        const heap = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(1);
        const external = (mem.external / 1024 / 1024).toFixed(1);
        const cpu = process.cpuUsage();
        const cpuSec = ((cpu.user + cpu.system) / 1e6).toFixed(2);
        const uptime = process.uptime().toFixed(1);
        addLog({ tag: 'INFO', msg: `Bot info:` });
        addLog({ tag: 'INFO', msg: `  Uptime: ${uptime}s` });
        addLog({ tag: 'INFO', msg: `  Memory: RSS ${rss}MB | Heap ${heap}/${heapTotal}MB | External ${external}MB` });
        addLog({ tag: 'INFO', msg: `  CPU time: ${cpuSec}s` });
        printLogs();
        showPrompt();
        return;
    } else if (input === 'ping') {
        addLog('[CONSOLE] ping command used');
        addLog({ tag: 'CONSOLE', msg: 'Pong! (console latency is always fast)' });
        printLogs();
        showPrompt();
        return;
    } else if (input.startsWith('reload ')) {
        addLog('[CONSOLE] reload command used');
        const cmdName = input.slice(7).trim();
        if (!cmdName) {
            resultMsg = '[RELOAD] Please specify a command name.';
        } else {
            // Try to reload the command file
            try {
                const commandsPath = path.join(__dirname, 'commands');
                const commandFiles = require('fs').readdirSync(commandsPath).filter(f => f.endsWith('.js'));
                const cmdFile = commandFiles.find(f => {
                    try {
                        const required = require(path.join(commandsPath, f));
                        return required.data && required.data.name === cmdName;
                    } catch (err) {
                        return false;
                    }
                });
                if (!cmdFile) {
                    resultMsg = '[RELOAD] Command not found: ' + cmdName;
                } else {
                    const cmdPath = path.join(commandsPath, cmdFile);
                    delete require.cache[require.resolve(cmdPath)];
                    require(cmdPath);
                    resultMsg = '[RELOAD] Command reloaded: ' + cmdName;
                }
            } catch (err) {
                resultMsg = '[RELOAD] Failed to reload command ' + cmdName + ': ' + err;
            }
        }
    } else if (input === 'sync') {
        addLog('[CONSOLE] sync command used');
        // real sync: delete all slash commands, then re-register
        let hadError = false;
        let deletedGlobal = false, deletedGuild = false, registered = false;
        try {
            // load .env if present
            let dotenvLoaded = false;
            try {
                require('dotenv').config({ path: require('path').join(__dirname, '.env') });
                dotenvLoaded = true;
            } catch (e) {
                addLog('[CONSOLE] .env not loaded: ' + e.message);
            }
            // load Discord.js and config
            let config;
            try {
                config = require('./config/styles.json');
            } catch (e) {
                addLog('[CONSOLE] config/styles.json not found or invalid: ' + e.message);
                hadError = true;
            }
            const token = process.env.DISCORD_TOKEN || process.env.TOKEN || (config && config.token);
            const clientId = process.env.CLIENT_ID || (config && config.clientId);
            const guildId = process.env.GUILD_ID || (config && config.guildId);
            if (!token) {
                addLog('[CONSOLE] ERROR: DISCORD_TOKEN is missing in .env or config.');
                hadError = true;
            }
            if (!clientId) {
                addLog('[CONSOLE] ERROR: CLIENT_ID is missing in .env or config.');
                hadError = true;
            }
            if (hadError) {
                printLogs();
                showPrompt();
                return;
            }
            addLog('[CONSOLE] Deleting all slash commands...');
            printLogs();
            showPrompt();
            const { REST, Routes, version } = require('discord.js');
            const rest = new REST({ version: '10' }).setToken(token);
            // Delete global commands
            try {
                await rest.put(Routes.applicationCommands(clientId), { body: [] });
                addLog('[CONSOLE] Global slash commands deleted.');
                deletedGlobal = true;
            } catch (e) {
                addLog('[CONSOLE] Failed to delete global commands: ' + e.message);
                hadError = true;
            }
            // Delete guild commands if GUILD_ID is set
            if (guildId) {
                try {
                    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
                    addLog('[CONSOLE] Guild slash commands deleted.');
                    deletedGuild = true;
                } catch (e) {
                    addLog('[CONSOLE] Failed to delete guild commands: ' + e.message);
                    hadError = true;
                }
            }
            if (!hadError) {
                addLog('[CONSOLE] All slash commands deleted. Re-registering...');
                printLogs();
                showPrompt();
                // Re-register using deploy.js in a separate process, capture output and log it
                const { spawn } = require('child_process');
                const deploy = spawn(process.argv[0], [require('path').join(__dirname, 'deploy.js')], { cwd: __dirname, env: process.env });
                deploy.stdout.on('data', (data) => {
                    data.toString().split(/\r?\n/).forEach(line => {
                        if (line.trim().length > 0) addLog(`[DEPLOY] ${line}`);
                    });
                    printLogs();
                });
                deploy.stderr.on('data', (data) => {
                    data.toString().split(/\r?\n/).forEach(line => {
                        if (line.trim().length > 0) addLog(`[DEPLOY] ${line}`);
                    });
                    printLogs();
                });
                deploy.on('exit', (code) => {
                    if (code === 0) {
                        addLog('[CONSOLE] Slash commands re-registered.');
                        registered = true;
                    } else {
                        addLog('[CONSOLE] deploy.js exited with code ' + code);
                        hadError = true;
                    }
                    // Final summary
                    if (!hadError && deletedGlobal && registered) {
                        addLog('[CONSOLE] Sync complete: All commands deleted and re-registered successfully.');
                    } else if (!hadError && (deletedGlobal || deletedGuild) && registered) {
                        addLog('[CONSOLE] Sync partial: Some commands deleted and re-registered, but not all.');
                    } else {
                        addLog('[CONSOLE] Sync failed. See above for details.');
                    }
                    printLogs();
                    showPrompt();
                });
                return;
            }
        } catch (err) {
            addLog('[CONSOLE] Sync failed: ' + err);
            hadError = true;
        }
        // Final summary (if deploy.js did not run)
        if (!hadError && deletedGlobal && registered) {
            addLog('[CONSOLE] Sync complete: All commands deleted and re-registered successfully.');
        } else if (!hadError && (deletedGlobal || deletedGuild) && registered) {
            addLog('[CONSOLE] Sync partial: Some commands deleted and re-registered, but not all.');
        } else {
            addLog('[CONSOLE] Sync failed. See above for details.');
        }
        printLogs();
        showPrompt();
        return;
    } else if (input === 'exit' || input === 'quit') {
        stopBot();
        process.exit(0);
    } else if (input.startsWith('ban ')) {
        addLog('[CONSOLE] ban command used');
        // ban [discord user id or username] [duration] [reason]
        // ban [discord user id or username] [duration] [reason]
        let userId = '', username = '';
        let banlistData = [];
        let banlist = [];
        const args = input.split(' ').slice(1);
        if (args.length < 3) {
            addLog({ tag: 'CONSOLE', msg: 'Usage: ban [discord id or username] [duration: h/d/m/y/perm] [reason]' });
            printLogs();
            showPrompt();
            return;
        }
        let [userArg, durationRaw, ...reasonArr] = args;
        const reason = reasonArr.join(' ');
        // Generate unique banId (1000-9999, not in use)
        let banlistRaw = [];
        if (fs.existsSync(banlistPath)) {
            try {
                banlistRaw = JSON.parse(fs.readFileSync(banlistPath, 'utf8'));
                banlistData = [...banlistRaw];
                banlist = [...banlistRaw];
            } catch (e) { banlistRaw = []; }
        }
        let banId;
        const usedBanIds = new Set((banlistRaw || []).map(b => b.banId).filter(id => typeof id === 'number'));
        do {
            banId = Math.floor(Math.random() * 9000) + 1000;
        } while (usedBanIds.has(banId));
        if (/^[0-9]{17,20}$/.test(userArg)) {
            // userArg is Discord ID, try to get username from banlist first
            const found = banlist.find(b => b.userId === userArg);
            if (found && found.username) {
                username = found.username;
            } else {
                // Try to resolve username using Discord API
                try {
                    const { spawnSync } = require('child_process');
                    // Use the token from process.env that was loaded at startup
                    const token = process.env.DISCORD_TOKEN;
                    if (!token) {
                        addLog({ tag: 'CONSOLE', msg: color.red('Discord token not available! Please restart the console.') });
                        printLogs();
                        showPrompt();
                        return;
                    }
                    const result = spawnSync(process.argv[0], [
                        path.join(__dirname, 'resolveUser.js'),
                        userArg,
                        '--byid',
                        '--token',
                        token
                    ], { encoding: 'utf8' });
                    if (result.status === 0 && result.stdout) {
                        let resolved;
                        let lines = result.stdout.trim().split(/\r?\n/);
                        let jsonLine = lines.find(l => l.trim().startsWith('{') && l.trim().endsWith('}'));
                        if (!jsonLine) {
                            addLog({ tag: 'CONSOLE', msg: 'Discord ID resolve output is not valid JSON: ' + result.stdout.trim() });
                            printLogs();
                            showPrompt();
                            return;
                        }
                        try {
                            resolved = JSON.parse(jsonLine);
                        } catch (err) {
                            addLog({ tag: 'CONSOLE', msg: 'Discord ID resolve output is not valid JSON: ' + jsonLine });
                            printLogs();
                            showPrompt();
                            return;
                        }
                        if (resolved && resolved.username) {
                            username = resolved.username;
                        } else {
                            addLog({ tag: 'CONSOLE', msg: 'Discord ID not found on Discord.' });
                            printLogs();
                            showPrompt();
                            return;
                        }
                    } else {
                        addLog({ tag: 'CONSOLE', msg: 'Failed to resolve Discord ID from Discord.' });
                        printLogs();
                        showPrompt();
                        return;
                    }
                } catch (e) {
                    addLog({ tag: 'CONSOLE', msg: 'Error resolving Discord ID: ' + e.message });
                    printLogs();
                    showPrompt();
                    return;
                }
            }
        } else {
            // userArg is username, try to get ID from banlist first
            const found = banlist.find(b => b.username && b.username.toLowerCase() === userArg.toLowerCase());
            if (found && found.userId) {
                userId = found.userId;
                username = found.username;
            } else {
                // Try to resolve ID using Discord API
                try {
                    const { spawnSync } = require('child_process');
                    // Load token from config or env
                    let token = process.env.DISCORD_TOKEN || process.env.TOKEN;
                    if (!token) {
                        try {
                            const config = require('./config/styles.json');
                            token = config.token;
                        } catch (e) {}
                    }
                    if (!token) {
                        addLog({ tag: 'CONSOLE', msg: color.red('Discord token not found in env or config!') });
                        printLogs();
                        showPrompt();
                        return;
                    }
                    const result = spawnSync(process.argv[0], [
                        path.join(__dirname, 'resolveUser.js'),
                        userArg,
                        '--token',
                        token
                    ], { encoding: 'utf8' });
                    if (result.status === 0 && result.stdout) {
                        let resolved;
                        let lines = result.stdout.trim().split(/\r?\n/);
                        let jsonLine = lines.find(l => l.trim().startsWith('{') && l.trim().endsWith('}'));
                        if (!jsonLine) {
                            addLog({ tag: 'CONSOLE', msg: 'Username resolve output is not valid JSON: ' + result.stdout.trim() });
                            printLogs();
                            showPrompt();
                            return;
                        }
                        try {
                            resolved = JSON.parse(jsonLine);
                        } catch (err) {
                            addLog({ tag: 'CONSOLE', msg: 'Username resolve output is not valid JSON: ' + jsonLine });
                            printLogs();
                            showPrompt();
                            return;
                        }
                        if (resolved && resolved.id) {
                            userId = resolved.id;
                            username = resolved.username;
                        } else {
                            addLog({ tag: 'CONSOLE', msg: 'Username not found on Discord.' });
                            printLogs();
                            showPrompt();
                            return;
                        }
                    } else {
                        addLog({ tag: 'CONSOLE', msg: 'Failed to resolve username from Discord.' });
                        printLogs();
                        showPrompt();
                        return;
                    }
                } catch (e) {
                    addLog({ tag: 'CONSOLE', msg: 'Error resolving username: ' + e.message });
                    printLogs();
                    showPrompt();
                    return;
                }
            }
        }
        if (!durationRaw || !reason) {
            addLog({ tag: 'CONSOLE', msg: 'Please specify duration and reason.' });
            printLogs();
            showPrompt();
            return;
        }
        // Parse duration
        let duration = durationRaw.toLowerCase();
        let expires = null;
        let durationText = '';
        const now = Date.now();
        if (duration === 'perm' || duration === 'permanent') {
            expires = null;
            durationText = 'Permanent';
        } else {
            // pl.: 5m, 2h, 1d, 1mo, 1y
            const match = duration.match(/^(\d+)(m|h|d|mo|y)$/);
            if (!match) {
                addLog({ tag: 'CONSOLE', msg: 'Invalid duration format. Use m/h/d/mo/y/perm (e.g. 5m, 2h, 1d, 1mo, 1y, perm)' });
                printLogs();
                showPrompt();
                return;
            }
            const num = parseInt(match[1]);
            const unit = match[2];
            let ms = 0;
            switch (unit) {
                case 'm':
                    ms = num * 60 * 1000; durationText = `${num} minute(s)`; break;
                case 'h':
                    ms = num * 60 * 60 * 1000; durationText = `${num} hour(s)`; break;
                case 'd':
                    ms = num * 24 * 60 * 60 * 1000; durationText = `${num} day(s)`; break;
                case 'mo':
                    ms = num * 30 * 24 * 60 * 60 * 1000; durationText = `${num} month(s)`; break;
                case 'y':
                    ms = num * 365 * 24 * 60 * 60 * 1000; durationText = `${num} year(s)`; break;
            }
            expires = now + ms;
        }
        let banlistFile = [];
        if (fs.existsSync(banlistPath)) {
            try {
                banlistFile = JSON.parse(fs.readFileSync(banlistPath, 'utf8'));
            } catch (e) {
                banlistFile = [];
            }
        }
        banlistData = banlistData.filter(b => b.userId !== userId);
        if (!username) {
            const prev = banlistData.find(b => b.userId === userId);
            if (prev && prev.username) username = prev.username;
        }
        // Remove any existing bans for this user with the same timestamp (to avoid duplicates)
        banlistData = banlistData.filter(b => !(b.userId === userId && b.timestamp === now));
        banlistData.push({ userId, username, duration: durationText, reason, timestamp: now, expires, banId });
        try {
            fs.writeFileSync(banlistPath, JSON.stringify(banlistData, null, 2), 'utf8');
            addLog({ tag: 'CONSOLE', msg: `User ${userId}${username ? ' (' + username + ')' : ''} banned for ${durationText}. Reason: ${reason}` });
        } catch (e) {
            addLog({ tag: 'CONSOLE', msg: 'Failed to update banlist.json: ' + e.message });
        }
        printLogs();
        showPrompt();
        return;
    } else if (input.startsWith('unban ')) {
        addLog('[CONSOLE] unban command used');
        // unban [discord id or username or banId]
        const args = input.split(' ').slice(1);
        if (args.length < 1) {
            addLog({ tag: 'CONSOLE', msg: 'Usage: unban [discord id or username or banId]' });
            printLogs();
            showPrompt();
            return;
        }
        const userArg = args[0];
        let banlist = [];
        if (fs.existsSync(banlistPath)) {
            try {
                banlist = JSON.parse(fs.readFileSync(banlistPath, 'utf8'));
            } catch (e) {
                banlist = [];
            }
        }
        let removed = false;
        if (/^[0-9]{17,20}$/.test(userArg)) {
            // Remove by ID
            const before = banlist.length;
            banlist = banlist.filter(b => b.userId !== userArg);
            removed = before !== banlist.length;
        } else if (/^[0-9]{4}$/.test(userArg)) {
            // Remove by banId
            const before = banlist.length;
            banlist = banlist.filter(b => b.banId !== parseInt(userArg));
            removed = before !== banlist.length;
        } else {
            // Remove by username
            const before = banlist.length;
            banlist = banlist.filter(b => !(b.username && b.username.toLowerCase() === userArg.toLowerCase()));
            removed = before !== banlist.length;
        }
        try {
            fs.writeFileSync(banlistPath, JSON.stringify(banlist, null, 2), 'utf8');
            if (removed) {
                addLog({ tag: 'CONSOLE', msg: `Unbanned ${userArg}` });
            } else {
                addLog({ tag: 'CONSOLE', msg: `No ban found for ${userArg}` });
            }
        } catch (e) {
            addLog({ tag: 'CONSOLE', msg: 'Failed to update banlist.json: ' + e.message });
        }
        printLogs();
        showPrompt();
        return;
    } else if (input === 'bans') {
        addLog('[CONSOLE] bans command used');
        let banlist = [];
        if (fs.existsSync(banlistPath)) {
            try {
                banlist = JSON.parse(fs.readFileSync(banlistPath, 'utf8'));
            } catch (e) {
                banlist = [];
            }
        }
        
        if (banlist.length === 0) {
            addLog({ tag: 'CONSOLE', msg: color.cyan('No active bans found.') });
        } else {
            addLog({ tag: 'CONSOLE', msg: color.bold(color.magenta('Current Active Bans:')) });
            const now = Date.now();
            banlist.forEach(ban => {
                let remaining = '';
                if (ban.expires) {
                    const timeLeft = ban.expires - now;
                    if (timeLeft <= 0) {
                        remaining = color.red('[Expired]');
                    } else {
                        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                        remaining = color.yellow(`[${days}d ${hours}h ${minutes}m]`);
                    }
                } else {
                    remaining = color.red('[Permanent]');
                }
                
                const username = ban.username ? color.cyan(ban.username) : color.dim('Unknown');
                const id = color.blue(`(${ban.userId})`);
                const reason = color.green(`[${ban.reason}]`);
                const banId = color.magenta(`#${ban.banId}`);
                
                addLog({ tag: 'CONSOLE', msg: `${username} ${id} ${banId} remaining: ${remaining} reason: ${reason}` });
            });
        }
        printLogs();
        showPrompt();
        return;
    } else if (input === 'help') {
        addLog('[CONSOLE] help command used');
        addLog({ tag: 'HELP', msg: 'help    - Show this help message' });
        addLog({ tag: 'HELP', msg: 'info    - Show bot info, memory, CPU, command count' });
        addLog({ tag: 'HELP', msg: 'ping    - Show bot and API latency' });
        addLog({ tag: 'HELP', msg: 'reload [command]   - Reload a command file' });
        addLog({ tag: 'HELP', msg: 'ban [id|username] [duration] [reason] - Ban user from bot (generates banId)' });
        addLog({ tag: 'HELP', msg: 'bans    - List all active bans with remaining time' });
        addLog({ tag: 'HELP', msg: 'unban [id|username|banId] - Unban user from bot (banId is 4-digit code)' });
        addLog({ tag: 'HELP', msg: 'clear   - Clear the log buffer' });
        addLog({ tag: 'HELP', msg: 'restart - Restart the bot' });
        addLog({ tag: 'HELP', msg: 'sync    - Sync slash commands with Discord API' });
        addLog({ tag: 'HELP', msg: 'exit    - Exit the console' });
        printLogs();
        showPrompt();
        return;
    } else {
        resultMsg = { 
            tag: 'CONSOLE', 
            msg: color.red('Unknown command: ' + color.yellow(input))
        };
    }
    if (resultMsg) addLog(resultMsg);
    printLogs();
    showPrompt();
});

// Start bot on launch
startBot();
