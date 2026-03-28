const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

function getInfoEmbeds(version) {
    return [
        // ...existing 4 pages...
        new EmbedBuilder()
            .setColor(0x393b40)
            .setTitle('ментай fansign gen')
            .setDescription('**Create realistic fansign images with custom fonts, styles, and advanced rendering.**')
            .addFields(
                { name: '🛠️ How the Engine Works', value:
                    '• ✨ Every fansign is generated through a multi-layered creative process, ensuring each result is visually authentic and one-of-a-kind.\n\n' +
                    '• 🧠 Advanced logic and dynamic effects simulate real handwriting, adapting to your chosen style and font for maximum realism.\n\n' +
                    '• 🎨 The engine intelligently blends your input with custom rendering techniques, making each image feel natural and handcrafted.\n\n' +
                    '• 🔒 Proprietary algorithms and adaptive systems prevent predictable or repetitive results, so every fansign remains unique.'
                }
            )
            .setThumbnail('https://cdn.discordapp.com/icons/1270768736550391929/7e2e7e2e7e2e7e2e7e2e7e2e7e2e7e2e.png?size=128')
            .setFooter({ text: `${version} | note & no log, data policy at the end! | Page 1/5` }),
        new EmbedBuilder()
            .setColor(0x393b40)
            .setTitle('ментай fansign gen')
            .addFields(
                { name: '🌟 Features', value:
                    '• ✍️ **Artisan font: **every letter is always unique, no two are ever exactly the same in any generation.\n\n' +
                    '• 🌐 **Font support:**\n   :flag_ru: Russian\n   :flag_jp: Japanese *(hiragana and katakana)*\n   :flag_hu: Hungarian\n   :england: English\n\n' +
                    '• 🧩 **70+ unique styles** *(available in full version)*\n\n' +
                    '• <:font:1394728388396322848> **5 custom handmade fonts** *(now you can use 1 font with mashup, more will be available in the full version)*\n\n' +
                    '• <:forbidden:1394736698793132224> **Blacklisted words, but u can use a lot of words exept racism**\n\n' +
                    '• 🛠️ **Custom text input with advanced rendering**\n\n' +
                    '• :free: **Free to use but there is a 30 sec cooldown (boosters have 0)**\n'
                }
            )
            .setFooter({ text: `${version} | note & no log, data policy at the end! | Page 2/5` }),
        new EmbedBuilder()
            .setColor(0x393b40)
            .setTitle('ментай fansign gen')
            .addFields(
                { name: '💻 Technology this project uses', value:
                    '<:typescript:1394344901524590763> *TypeScript*\n' +
                    '<:javascript:1394344830632591360> *JavaScript*\n' +
                    '<:nodejs:1394344852283723967> *Node.js*\n' +
                    '<:rust:1394344891013795910> *Rust*\n' +
                    '<:python:1394365663975444712> *Python*\n' +
                    '<:fontforge:1394817793261568130> *FontForge*'
                }
            )
            .setFooter({ text: `${version} | note & no log, data policy at the end! | Page 3/5` }),
        new EmbedBuilder()
            .setColor(0x393b40)
            .setTitle('ментай fansign gen')
            .addFields(
                { name: '⚠️ Note', value:
                    'This is a test build. Some bugs may exist and features may change.\n' +
                    'As a solo developer, it\'s not the fastest process to write and test.<a:WHAT:1394396843907219607>\n' +
                    'If you find any bug or you have any question -> <@268966463161761803>\n' +
                    '\n<:Exclamation:1394393111131852920>**This bot is for educational purposes only.**<:Exclamation:1394393111131852920>\n' +
                    'I made this project to learn and improve my skills, not for commercial use or earn money with this bot. \n'
                }
            )
            .setFooter({ text: `${version} | note & no log, data policy at the end! | Page 4/5` }),
        new EmbedBuilder()
            .setColor(0x393b40)
            .setTitle('No Log Policy & Data Privacy')
            .addFields(
                { name: '🔒 No Log Policy', value:
                    '• This bot does **not** store any data outside Discord. There is **no database** and no external logging.\n\n' +
                    '• Only public Discord information is used for moderation (ban system), such as username and Discord user ID.\n\n' +
                    '• No private messages, server content, or sensitive data is ever saved or processed outside Discord.\n\n' +
                    '• Your privacy is fully respected: nothing is tracked, logged, or analyzed beyond what Discord itself provides.'
                }
            )
            .setFooter({ text: `${version} | note & no log, data policy at the end! | Page 5/5` })
    ];
}

function getNavRow(page, userId) {
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`info_prev_${userId}`)
            .setEmoji('1394728379084963910')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`info_next_${userId}`)
            .setEmoji('1394728369391669328')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 4)
    );
    return [navRow];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Get details about the bot and its features'),
    async execute(interaction) {
        // Only read config once at startup for version
        let version = global._mentai_version || 'Unknown';
        if (!global._mentai_version) {
            try {
                const configPath = path.join(__dirname, '../config/config.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                version = config.version || version;
                global._mentai_version = version;
            } catch (e) {}
        }
        const embeds = getInfoEmbeds(version);
        const userId = interaction.user.id;
        const rows = getNavRow(0, userId);
        await interaction.reply({ embeds: [embeds[0]], components: rows, flags: 64 });
    },
    async handleButton(interaction) {
        // Only allow the user who invoked the command to use the buttons
        let userId = null, pageNum = null;
        const customId = typeof interaction.customId === 'string' ? interaction.customId : '';
        if (customId.startsWith('info_page_')) {
            // info_page_X_USERID, userId may contain underscores
            const match = customId.match(/^info_page_(\d+)_(.+)$/);
            if (match) {
                pageNum = parseInt(match[1], 10);
                userId = match[2];
            } else {
                // fallback: split from the last underscore
                const idx = customId.lastIndexOf('_');
                pageNum = parseInt(customId.slice(10, idx), 10);
                userId = customId.slice(idx + 1);
            }
        } else if (customId.startsWith('info_prev_') || customId.startsWith('info_next_')) {
            const idx = customId.lastIndexOf('_');
            userId = customId.slice(idx + 1);
        } else {
            // fallback for any unexpected format
            const idx = customId.lastIndexOf('_');
            userId = idx !== -1 ? customId.slice(idx + 1) : null;
        }
        // Debug log for troubleshooting
        // console.log('customId:', customId, 'userId:', userId, 'pageNum:', pageNum, 'interaction.user.id:', interaction.user.id);
        if (!userId || String(interaction.user.id) !== userId) {
            await interaction.update({ content: 'You cannot use these buttons.', components: [], embeds: [] });
            return;
        }
        // Get current page from message footer
        const version = interaction.message.embeds[0]?.footer?.text?.split(' | ')[0] || 'Unknown';
        let page = 0;
        const footer = interaction.message.embeds[0]?.footer?.text;
        if (footer) {
            const match = footer.match(/Page (\d+)\/5/);
            if (match) page = parseInt(match[1], 10) - 1;
        }
        // Defensive: ensure page is always 0-4
        if (isNaN(page) || page < 0 || page > 4) page = 0;
        if (customId.startsWith('info_prev_')) {
            page = Math.max(0, page - 1);
        } else if (customId.startsWith('info_next_')) {
            page = Math.min(4, page + 1);
        } else if (customId.startsWith('info_page_')) {
            if (pageNum !== null && !isNaN(pageNum) && pageNum >= 0 && pageNum <= 4) page = pageNum;
        }
        // Defensive: ensure page is always 0-4
        if (isNaN(page) || page < 0 || page > 4) page = 0;
        const embeds = getInfoEmbeds(version);
        const rows = getNavRow(page, userId);
        await interaction.update({ embeds: [embeds[page]], components: rows });
    }
};