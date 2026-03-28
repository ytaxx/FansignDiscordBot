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
        .setName('fs3')
        .setDescription('Make a fansign with custom text and style (styles 51-54)')
        .addStringOption(option =>
            option.setName('style')
                .setDescription('choose the fansign style')
                .setRequired(true)
                .addChoices(...styles.slice(50).map(s => ({ name: s.name, value: s.name })))
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
            await interaction.reply({ content: '<:crossmark:1393755852221190205> Ezt a parancsot csak a kijelölt csatornában lehet használni!', flags: 64 });
            return;
        }
        // Proxy to fansignRender's execute, but with style range enforced
        return require('./fansignRender').execute(interaction);
    }
};
