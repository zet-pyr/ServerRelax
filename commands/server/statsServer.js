// Commande pour voir les statistiques d'un serveur
const {SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-stats')
        .setDescription('Affiche les statistiques du serveur 🌌'),
        async execute(interaction) {
            const guild = interaction.guild;
            const memberCount = guild.memberCount;
            
            // Correction: filtrer correctement les membres en ligne
            let onlineCount = 0;
            try {
                onlineCount = guild.members.cache.filter(member => 
                    member.presence?.status === 'online' || 
                    member.presence?.status === 'dnd' || 
                    member.presence?.status === 'idle'
                ).size;
            } catch (error) {
                console.error("Erreur de récupération des présences:", error);
            }
            
            const channelCount = guild.channels.cache.size;
            const textChannelCount = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText).size;
            const voiceChannelCount = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice).size;
            const roleCount = guild.roles.cache.size;
            
            // Limiter les rôles affichés pour ne pas rendre l'embed trop long
            const showRoles = guild.roles.cache
                .filter(role => !role.managed && role.name !== '@everyone')
                .map(role => role.name)
                .slice(0, 10)
                .join(', ') + (guild.roles.cache.size > 10 ? '...' : '');
            
            // Correction: utiliser le bon type pour les catégories
            const categoryCount = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory).size;
            
            // Correction: les activités ne sont pas sur l'objet guild
            const activityServer = 'Information non disponible via l\'API';
            
            // Correction: utiliser createdAt au lieu de createAt
            const createdAt = guild.createdAt.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const emojiCount = guild.emojis.cache.size;
            const stickerCount = guild.stickers?.cache.size || 0;
            const region = guild.preferredLocale;
            const verificationLevel = getVerificationLevel(guild.verificationLevel);
            const boostCount = guild.premiumSubscriptionCount || 0;
            const boostTier = guild.premiumTier || '0';
            const maximumBitrate = getMaximumBitrate(guild.maximumBitrate);

            const embed = new EmbedBuilder()
                .setColor('#A8DADC')
                .setTitle(`📊 Statistiques du serveur ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
                .addFields(
                    { name: '👥 Membres', value: `👤 Total: **${memberCount}**\n🟢 En ligne: **${onlineCount}**`, inline: true },
                    { name: '📚 Salons', value: `📊 Total: **${channelCount}**\n💬 Textuels: **${textChannelCount}**\n🔊 Vocaux: **${voiceChannelCount}**\n📁 Catégories: **${categoryCount}**`, inline: true },
                    { name: '🏆 Rôles', value: `📋 Nombre: **${roleCount}**\n🎭 Liste: ${showRoles}`, inline: false },
                    { name: '📅 Création', value: `🗓️ Date: **${createdAt}**`, inline: true },
                    { name: '🌐 Région', value: `🏳️ Locale: **${region}**`, inline: true },
                    { name: '🛡️ Sécurité', value: `🔒 Niveau: **${verificationLevel}**`, inline: true },
                    { name: '😀 Émojis & Stickers', value: `😄 Émojis: **${emojiCount}**\n🎭 Stickers: **${stickerCount}**`, inline: true },
                    { name: '🚀 Boost', value: `💪 Niveau: **${boostTier}**\n🎁 Boosts: **${boostCount}**`, inline: true },
                    { name: '🎙️ Qualité Audio', value: `🔊 Bitrate max: **${maximumBitrate}**`, inline: true },
                    { name: '🌟 Information additionnelle', value: `👑 Propriétaire: <@${guild.ownerId}>\n🆔 ID Serveur: \`${guild.id}\``, inline: false }
                )
                .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
};

// Fonctions utilitaires
function getVerificationLevel(level) {
    const levels = {
        0: 'Aucune',
        1: 'Faible',
        2: 'Moyenne',
        3: 'Élevée',
        4: 'Très Élevée'
    };
    return levels[level] || 'Inconnue';
}

function getMaximumBitrate(bitrate) {
    if (!bitrate) return "Standard (96 kbps)";
    
    // Convertir de bps en kbps
    const kbps = Math.floor(bitrate / 1000);
    return `${kbps} kbps`;
}