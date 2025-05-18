const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Fait un test de latence avec le bot 🏓')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type de ping à tester')
                .addChoices(
                    { name: '🌐 API', value: 'api' },
                    { name: '🔌 WebSocket', value: 'ws' },
                    { name: '⚡ Les deux', value: 'both' },
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        // Commencer par différer la réponse pour mesurer le ping du message
        await interaction.deferReply();
        
        const startTime = Date.now();
        const type = interaction.options.getString('type') || 'both';
        const client = interaction.client;
        
        // Obtenir les différents types de latence
        const apiPing = client.ws.ping;
        const messagePing = Date.now() - startTime;
        
        // Préparer les données à afficher selon le type demandé
        let pingData = '';
        let color = '';
        
        if (type === 'api') {
            pingData = `🌐 **API**: ${apiPing}ms`;
            color = getPingColor(apiPing);
        } else if (type === 'ws') {
            pingData = `🔌 **WebSocket**: ${messagePing}ms`;
            color = getPingColor(messagePing);
        } else { // both
            pingData = `🌐 **API**: ${apiPing}ms\n🔌 **Message**: ${messagePing}ms\n⏱️ **Total**: ${apiPing + messagePing}ms`;
            color = getPingColor(Math.max(apiPing, messagePing));
        }

        const emoji = getPingEmoji(color);
        
        // Créer l'embed avec un design amélioré
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${emoji} Test de latence`)
            .setDescription(pingData)
            .addFields(
                { name: '📊 État du système', value: `💾 **Mémoire**: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n⏰ **En ligne depuis**: ${formatUptime(client.uptime)}` }
            )
            .setTimestamp()
            .setFooter({ text: 'Vérification de la latence effectuée avec succès' });

        // Créer un bouton pour refaire le test
        const refreshButton = new ButtonBuilder()
            .setCustomId('refresh_ping')
            .setLabel('🔄 Refaire le test')
            .setStyle(ButtonStyle.Primary);
        
        // Créer un bouton pour afficher les détails techniques
        const detailsButton = new ButtonBuilder()
            .setCustomId('ping_details')
            .setLabel('📋 Détails techniques')
            .setStyle(ButtonStyle.Secondary);
            
        const row = new ActionRowBuilder().addComponents(refreshButton, detailsButton);

        // Envoyer la réponse
        await interaction.editReply({ embeds: [embed], components: [row] });
        
        // Gestionnaire pour les interactions de bouton
        const filter = i => (i.customId === 'refresh_ping' || i.customId === 'ping_details') && 
                            i.user.id === interaction.user.id;
        
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
        
        collector.on('collect', async i => {
            if (i.customId === 'refresh_ping') {
                // Refaire le test
                await i.deferUpdate();
                
                const newStartTime = Date.now();
                const newApiPing = client.ws.ping;
                const newMessagePing = Date.now() - newStartTime;
                
                let newPingData = '';
                let newColor = '';
                
                if (type === 'api') {
                    newPingData = `🌐 **API**: ${newApiPing}ms`;
                    newColor = getPingColor(newApiPing);
                } else if (type === 'ws') {
                    newPingData = `🔌 **WebSocket**: ${newMessagePing}ms`;
                    newColor = getPingColor(newMessagePing);
                } else {
                    newPingData = `🌐 **API**: ${newApiPing}ms\n🔌 **Message**: ${newMessagePing}ms\n⏱️ **Total**: ${newApiPing + newMessagePing}ms`;
                    newColor = getPingColor(Math.max(newApiPing, newMessagePing));
                }
                
                const newEmoji = getPingEmoji(newColor);
                
                const newEmbed = new EmbedBuilder()
                    .setColor(newColor)
                    .setTitle(`${newEmoji} Test de latence`)
                    .setDescription(newPingData)
                    .addFields(
                        { name: '📊 État du système', value: `💾 **Mémoire**: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n⏰ **En ligne depuis**: ${formatUptime(client.uptime)}` }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Vérification de la latence effectuée avec succès' });
                
                await interaction.editReply({ embeds: [newEmbed], components: [row] });
            } 
            else if (i.customId === 'ping_details') {
                // Afficher des détails techniques
                const detailEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📋 Détails techniques')
                    .addFields(
                        { name: '🖥️ Processus', value: `**PID**: ${process.pid}\n**Platform**: ${process.platform}\n**Version Node**: ${process.version}`, inline: true },
                        { name: '📈 Utilisation mémoire', value: `**RSS**: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB\n**Heap**: ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)}MB\n**Heap utilisé**: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`, inline: true },
                        { name: '🤖 Bot', value: `**Discord.js**: v${require('discord.js').version}\n**Shards**: ${client.shard ? client.shard.count : 'Aucun'}\n**Serveurs**: ${client.guilds.cache.size}`, inline: false }
                    )
                    .setTimestamp();
                
                await i.reply({ embeds: [detailEmbed], ephemeral: true });
            }
        });
        
        collector.on('end', async collected => {
            // Désactiver les boutons après expiration
            const expiredRow = new ActionRowBuilder().addComponents(
                refreshButton.setDisabled(true),
                detailsButton.setDisabled(true)
            );
            
            await interaction.editReply({ components: [expiredRow] }).catch(() => {});
        });
    }
};

/**
 * Retourne une couleur selon la qualité du ping
 * @param {number} ping - La valeur du ping en ms
 * @returns {string} - Code couleur hexadécimal
 */
function getPingColor(ping) {
    if (ping < 100) return '#43B581'; // Vert - Excellent
    if (ping < 200) return '#FAA61A'; // Jaune - Bon
    if (ping < 400) return '#F04747'; // Rouge - Moyen
    return '#747F8D'; // Gris - Mauvais
}

/**
 * Retourne un emoji selon la qualité du ping
 * @param {string} color - La couleur représentant la qualité
 * @returns {string} - Emoji correspondant
 */
function getPingEmoji(color) {
    switch (color) {
        case '#43B581': return '🟢'; // Excellent
        case '#FAA61A': return '🟡'; // Bon
        case '#F04747': return '🔴'; // Moyen
        default: return '⚫'; // Mauvais
    }
}

/**
 * Formate une durée en millisecondes en chaîne lisible
 * @param {number} ms - Durée en millisecondes
 * @returns {string} - Chaîne formatée
 */
function formatUptime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    
    return parts.join(' ');
}