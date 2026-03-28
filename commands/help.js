const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all bot commands'),
    async execute(interaction) {
        const allowedChannel = '1394020049211228383';
        if (interaction.channelId !== allowedChannel) {
            await interaction.reply({ content: '<:crossmark:1393755852221190205> This command can only be used in the command channel!', flags: 64 });
            return;
        }
        const guildIcon = interaction.guild?.iconURL() || undefined;
        const embed = new EmbedBuilder()
            .setTitle('ментай')
            .setDescription('[free vbucks](https://www.youtube.com/watch?v=dQw4w9WgXcQ)')
            .addFields(
                { name: 'Fing', value: '`/fansign`', inline: true },
                { name: 'test', value: '`/test, /test2`', inline: true },
            )
            .setFooter({ text: 'ytax', iconURL: guildIcon });
        await interaction.reply({ embeds: [embed], flags: 64 });
    },
};
