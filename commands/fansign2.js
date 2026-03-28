const fansignRender = require('./fansignRender');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const stylesConfigPath = path.join(__dirname, '../config/styles.json');
let styles = [];
function loadStyles() {
    try {
        styles = JSON.parse(fs.readFileSync(stylesConfigPath, 'utf8'));
    } catch (e) {
        styles = [];
    }
}
loadStyles();
fs.watchFile(stylesConfigPath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        loadStyles();
    }
});
const fontsDir = path.join(__dirname, '../fonts');
const fontFiles = fs.readdirSync(fontsDir).filter(f => f.endsWith('.ttf'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fs2')
        .setDescription('Make a fansign with custom text and style (styles 26-50)')
        .addStringOption(option =>
            option.setName('style')
                .setDescription('choose the fansign style')
                .setRequired(true)
                .addChoices(...styles.slice(25, 50).map(s => ({ name: s.name, value: s.name })))
        )
        .addStringOption(option =>
            option.setName('text')
                .setDescription('the text to put on the fansign')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('font')
                .setDescription('choose a font')
                .setRequired(true)
                .addChoices(...fontFiles.map(f => ({ name: f.replace('.ttf',''), value: f })))
        ),
    async execute(interaction) {
        const allowedChannel = '1394020049211228383';
        if (interaction.channelId !== allowedChannel) {
            await interaction.reply({ content: '<:crossmark:1393755852221190205> This command can only be used in the command channel!', flags: 64 });
            return;
        }
        
        // Defer the reply immediately
        await interaction.deferReply();
        
        try {
            // proxy to fansignRender's execute, but with style range enforced
            await require('./fansignRender').execute(interaction);
        } catch (error) {
            if (error.code === 10062) return; // Ignore unknown interaction errors
            console.error('[FS2 ERROR]', error);
            try {
                await interaction.editReply({ content: '<:crossmark:1393755852221190205> An error occurred while creating your fansign.' });
            } catch (e) {
                console.error('[FS2 REPLY ERROR]', e);
            }
        }
    }
};
