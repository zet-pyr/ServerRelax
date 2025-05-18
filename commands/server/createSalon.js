const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-salon')
        .setDescription('Créer un ou plusieurs salons 🗂️')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type de salon à créer')
                .setRequired(true)
                .addChoices(
                    { name: 'Textuel', value: 'GUILD_TEXT' },
                    { name: 'Vocal', value: 'GUILD_VOICE' },
                    { name: 'Forum', value: 'GUILD_FORUM' },
                    { name: 'Annonces', value: 'GUILD_ANNOUNCEMENT' },
                    { name: 'Scène', value: 'GUILD_STAGE_VOICE' },
                    { name: 'Catégorie', value: 'GUILD_CATEGORY' }
                ))
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom du salon (utilisez des virgules pour créer plusieurs salons)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('catégorie')
                .setDescription('Catégorie dans laquelle créer le(s) salon(s)')
                .addChannelTypes(ChannelType.GuildCategory))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const { guild } = interaction;
        
        // Vérification des permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas la permission de gérer les salons sur ce serveur.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const channelType = interaction.options.getString('type');
            const channelNames = interaction.options.getString('nom').split(',').map(name => name.trim());
            const category = interaction.options.getChannel('catégorie');

            // Correspondance entre les valeurs d'option et les types de canaux Discord.js
            const channelTypeMap = {
                'GUILD_TEXT': ChannelType.GuildText,
                'GUILD_VOICE': ChannelType.GuildVoice,
                'GUILD_FORUM': ChannelType.GuildForum,
                'GUILD_ANNOUNCEMENT': ChannelType.GuildAnnouncement,
                'GUILD_STAGE_VOICE': ChannelType.GuildStageVoice,
                'GUILD_CATEGORY': ChannelType.GuildCategory
            };

            const createdChannels = [];
            
            // Création des salons
            for (const name of channelNames) {
                if (!name) continue; // Ignorer les noms vides
                
                try {
                    // Création du salon avec l'API mise à jour
                    const newChannel = await guild.channels.create({
                        name: name,
                        type: channelTypeMap[channelType],
                        parent: category ? category.id : null,
                        reason: `Salon créé par ${interaction.user.tag}`
                    });
                    
                    createdChannels.push(newChannel);
                } catch (channelError) {
                    console.error(`Erreur lors de la création du salon ${name}:`, channelError);
                }
            }

            // Si aucun salon n'a été créé, informer l'utilisateur et arrêter
            if (createdChannels.length === 0) {
                return await interaction.editReply({
                    content: '❌ Aucun salon n\'a pu être créé. Veuillez vérifier les types de salons et réessayer.',
                    ephemeral: true
                });
            }

            // Création de l'embed de confirmation
            const embed = new EmbedBuilder()
                .setTitle('🗂️ Création de salons')
                .setDescription(`**${createdChannels.length}** salon(s) ont été créés avec succès !`)
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Salons créés', value: createdChannels.map(channel => `<#${channel.id}>`).join('\n') || 'Aucun' },
                    { name: 'Type', value: channelType.replace('GUILD_', '').toLowerCase() }
                )
                .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            // Boutons pour des actions supplémentaires
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('add-permissions')
                        .setLabel('Configurer les permissions')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('delete-channels')
                        .setLabel('Supprimer les salons créés')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            // Collecteur pour les interactions avec les boutons
            const filter = i => i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'add-permissions') {
                    // Ouvrir un modal pour configurer les permissions
                    const modal = new ModalBuilder()
                        .setCustomId('permissions-modal')
                        .setTitle('Configuration des permissions');
                    
                    const roleInput = new TextInputBuilder()
                        .setCustomId('role-id')
                        .setLabel('ID du rôle (laissez vide pour @everyone)')
                        .setPlaceholder('123456789012345678')
                        .setRequired(false)
                        .setStyle(TextInputStyle.Short);
                    
                    const permissionsInput = new TextInputBuilder()
                        .setCustomId('permissions')
                        .setLabel('Permissions (VIEW_CHANNEL, SEND_MESSAGES)')
                        .setPlaceholder('VIEW_CHANNEL, SEND_MESSAGES')
                        .setRequired(true)
                        .setStyle(TextInputStyle.Paragraph);
                    
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(roleInput),
                        new ActionRowBuilder().addComponents(permissionsInput)
                    );
                    
                    await i.showModal(modal);
                } else if (i.customId === 'delete-channels') {
                    // Supprimer les salons créés
                    let deletedCount = 0;
                    for (const channel of createdChannels) {
                        try {
                            if (channel.deletable) {
                                await channel.delete('Supprimé via commande create-salon');
                                deletedCount++;
                            }
                        } catch (deleteError) {
                            console.error(`Erreur lors de la suppression du salon ${channel.name}:`, deleteError);
                        }
                    }
                    
                    await i.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🗑️ Suppression de salons')
                                .setDescription(`${deletedCount} salon(s) ont été supprimés.`)
                                .setColor('#e74c3c')
                                .setTimestamp()
                        ],
                        components: []
                    });
                }
            });

            // Gestion du modal de permissions
            const modalFilter = i => i.customId === 'permissions-modal' && i.user.id === interaction.user.id;
            interaction.client.once('interactionCreate', async interaction => {
                if (!interaction.isModalSubmit() || !modalFilter(interaction)) return;
                
                try {
                    const roleId = interaction.fields.getTextInputValue('role-id') || guild.roles.everyone.id;
                    const permissionsText = interaction.fields.getTextInputValue('permissions');
                    const permissionsArray = permissionsText.split(',').map(p => p.trim().toUpperCase());
                    
                    // Créer un objet de permissions basé sur les entrées
                    const permissionsObj = {};
                    
                    // Liste des permissions possibles
                    const permissionsList = {
                        'VIEW_CHANNEL': 'ViewChannel',
                        'SEND_MESSAGES': 'SendMessages',
                        'READ_MESSAGE_HISTORY': 'ReadMessageHistory',
                        'CONNECT': 'Connect',
                        'SPEAK': 'Speak'
                    };
                    
                    // Initialiser toutes les permissions à null (pas de changement)
                    Object.values(permissionsList).forEach(perm => {
                        permissionsObj[perm] = null;
                    });
                    
                    // Activer les permissions spécifiées
                    permissionsArray.forEach(perm => {
                        if (permissionsList[perm]) {
                            permissionsObj[permissionsList[perm]] = true;
                        }
                    });
                    
                    let successCount = 0;
                    for (const channel of createdChannels) {
                        try {
                            await channel.permissionOverwrites.create(roleId, permissionsObj);
                            successCount++;
                        } catch (err) {
                            console.error(`Erreur lors de la définition des permissions pour ${channel.name}:`, err);
                        }
                    }
                    
                    await interaction.reply({
                        content: `✅ Permissions configurées pour ${successCount}/${createdChannels.length} salon(s).`,
                        ephemeral: true
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Erreur lors de la configuration des permissions: ${error.message}`,
                        ephemeral: true
                    });
                }
            });

        } catch (error) {
            console.error('Erreur lors de la création des salons:', error);
            await interaction.editReply({
                content: `❌ Une erreur est survenue lors de la création des salons: ${error.message}`,
                ephemeral: true
            });
        }
    }
};