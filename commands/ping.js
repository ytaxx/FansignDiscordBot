const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Shows the response time.'),
    async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiPing = interaction.client.ws.ping;
        const allowedChannel = '1394020049211228383';
        if (interaction.channelId !== allowedChannel) {
            await interaction.reply({ content: '<:crossmark:1393755852221190205> This command can only be used in the command channel!', flags: 64 });
            return;
        }
        await interaction.editReply(`🏓 Pong! Bot latency: ${latency}ms | API ping: ${apiPing}ms`);
    },
};