const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, 
    ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome-config')
        .setDescription('Configure le système de messages de bienvenue 👋')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Activer le système de messages de bienvenue')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Le salon où les messages de bienvenue seront envoyés')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Désactiver le système de messages de bienvenue'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Tester le message de bienvenue'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Voir la configuration actuelle des messages de bienvenue')),

    async execute(interaction) {
        // Vérifier les permissions de l'utilisateur
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas la permission de gérer les messages de bienvenue.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // Obtenir la configuration actuelle du serveur
        let welcomeConfig = interaction.client.welcomeConfig || new Map();
        let serverConfig = welcomeConfig.get(interaction.guild.id) || {
            enabled: false,
            channelId: null,
            message: `🌟 **Bienvenue {user} sur {server} !** 🌟\n\nNotre communauté compte désormais **{memberCount}** membres ! Nous sommes ravis de t'accueillir parmi nous.`,
            embedColor: '#5865F2',
            embedTitle: '🎉 Nouveau membre • Bienvenue !',
            embedDescription: `### Bonjour {username} !

📣 **Bienvenue sur notre serveur !**

Nous sommes très heureux de t'accueillir dans notre communauté. N'hésite pas à te présenter et à participer aux discussions.

✅ **Quelques informations utiles:**
• Consulte nos règles pour une expérience agréable
• Découvre nos salons thématiques
• Participe aux événements communautaires

Nous espérons que tu te plairas parmi nous !`,
            embedFooter: '👋 {username} nous a rejoint le {date}',
            withImage: true
        };

        switch (subcommand) {
            case 'enable':
                await handleEnableCommand(interaction, welcomeConfig, serverConfig);
                break;
            case 'disable':
                await handleDisableCommand(interaction, welcomeConfig, serverConfig);
                break;
            case 'test':
                await handleTestCommand(interaction, serverConfig);
                break;
            case 'status':
                await handleStatusCommand(interaction, serverConfig);
                break;
        }
    },
};

/**
 * Gère l'activation du système de messages de bienvenue
 * @param {import('discord.js').CommandInteraction} interaction 
 * @param {Map} welcomeConfig 
 * @param {Object} serverConfig 
 */
async function handleEnableCommand(interaction, welcomeConfig, serverConfig) {
    const channel = interaction.options.getChannel('channel');
    
    // Vérifier que le bot a les permissions nécessaires pour envoyer des messages dans ce salon
    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
        return interaction.reply({
            content: `❌ Je n'ai pas les permissions nécessaires pour envoyer des messages dans ${channel}.`,
            ephemeral: true
        });
    }

    // Mettre à jour la configuration
    serverConfig.enabled = true;
    serverConfig.channelId = channel.id;
    welcomeConfig.set(interaction.guild.id, serverConfig);
    interaction.client.welcomeConfig = welcomeConfig;

    // Envoyer un message de confirmation
    const embed = new EmbedBuilder()
        .setColor('#43B581')
        .setTitle('✅ Messages de bienvenue activés')
        .setDescription(`Les messages de bienvenue sont maintenant activés dans ${channel}.`)
        .setTimestamp();

    // Créer les boutons pour personnaliser le message
    const customizeButton = new ButtonBuilder()
        .setCustomId('welcome_customize')
        .setLabel('✏️ Personnaliser')
        .setStyle(ButtonStyle.Primary);

    const testButton = new ButtonBuilder()
        .setCustomId('welcome_test')
        .setLabel('🧪 Tester')
        .setStyle(ButtonStyle.Secondary);

    const disableButton = new ButtonBuilder()
        .setCustomId('welcome_disable')
        .setLabel('❌ Désactiver')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(customizeButton, testButton, disableButton);

    await interaction.reply({ embeds: [embed], components: [row] });

    // Mettre en place un collecteur pour les interactions avec les boutons
    const filter = i => i.user.id === interaction.user.id && 
                       i.customId.startsWith('welcome_');
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 180000 }); // 3 minutes

    collector.on('collect', async i => {
        switch (i.customId) {
            case 'welcome_customize':
                await showCustomizationMenu(i, serverConfig, welcomeConfig);
                break;
            case 'welcome_test':
                await sendTestWelcomeMessage(i, serverConfig);
                break;
            case 'welcome_disable':
                serverConfig.enabled = false;
                welcomeConfig.set(interaction.guild.id, serverConfig);
                interaction.client.welcomeConfig = welcomeConfig;
                
                const disabledEmbed = new EmbedBuilder()
                    .setColor('#F04747')
                    .setTitle('❌ Messages de bienvenue désactivés')
                    .setDescription('Les messages de bienvenue ont été désactivés.')
                    .setTimestamp();
                
                await i.update({ embeds: [disabledEmbed], components: [] });
                collector.stop();
                break;
        }
    });

    collector.on('end', () => {
        // Désactiver les boutons après expiration
        const expiredRow = new ActionRowBuilder().addComponents(
            customizeButton.setDisabled(true),
            testButton.setDisabled(true),
            disableButton.setDisabled(true)
        );
        
        interaction.editReply({ components: [expiredRow] }).catch(() => {});
    });
}

/**
 * Gère la désactivation du système de messages de bienvenue
 * @param {import('discord.js').CommandInteraction} interaction 
 * @param {Map} welcomeConfig 
 * @param {Object} serverConfig 
 */
async function handleDisableCommand(interaction, welcomeConfig, serverConfig) {
    if (!serverConfig.enabled) {
        return interaction.reply({
            content: '❌ Le système de messages de bienvenue est déjà désactivé.',
            ephemeral: true
        });
    }

    serverConfig.enabled = false;
    welcomeConfig.set(interaction.guild.id, serverConfig);
    interaction.client.welcomeConfig = welcomeConfig;

    const embed = new EmbedBuilder()
        .setColor('#F04747')
        .setTitle('❌ Messages de bienvenue désactivés')
        .setDescription('Le système de messages de bienvenue a été désactivé.')
        .setTimestamp();

    const enableButton = new ButtonBuilder()
        .setCustomId('welcome_enable')
        .setLabel('✅ Réactiver')
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(enableButton);

    await interaction.reply({ embeds: [embed], components: [row] });

    // Mettre en place un collecteur pour le bouton de réactivation
    const filter = i => i.user.id === interaction.user.id && i.customId === 'welcome_enable';
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        await i.deferUpdate();
        
        // Demander le channel pour la réactivation
        const selectChannelEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🔄 Réactivation des messages de bienvenue')
            .setDescription('Veuillez sélectionner un salon pour les messages de bienvenue:');
            
        // Créer un menu pour sélectionner le salon
        const channelSelectModal = new ModalBuilder()
            .setCustomId('welcome_channel_select')
            .setTitle('Sélectionner un salon');
            
        const channelInput = new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('ID ou nom du salon')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Exemple: 123456789012345678 ou general')
            .setRequired(true);
            
        const actionRow = new ActionRowBuilder().addComponents(channelInput);
        channelSelectModal.addComponents(actionRow);
        
        await i.showModal(channelSelectModal);
        
        try {
            const modalSubmit = await i.awaitModalSubmit({ 
                filter: i => i.customId === 'welcome_channel_select' && i.user.id === interaction.user.id,
                time: 60000
            });
            
            const channelInput = modalSubmit.fields.getTextInputValue('channel_id');
            let channel;
            
            // Essayer de trouver le salon par ID
            if (/^\d+$/.test(channelInput)) {
                channel = interaction.guild.channels.cache.get(channelInput);
            }
            
            // Sinon, essayer de trouver le salon par nom
            if (!channel) {
                channel = interaction.guild.channels.cache.find(
                    ch => ch.name.toLowerCase() === channelInput.toLowerCase() && 
                    ch.type === ChannelType.GuildText
                );
            }
            
            if (!channel) {
                return modalSubmit.reply({
                    content: '❌ Salon introuvable. Veuillez réessayer avec un ID ou un nom valide.',
                    ephemeral: true
                });
            }
            
            // Vérifier les permissions
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
                return modalSubmit.reply({
                    content: `❌ Je n'ai pas les permissions nécessaires pour envoyer des messages dans ${channel}.`,
                    ephemeral: true
                });
            }
            
            // Réactiver le système
            serverConfig.enabled = true;
            serverConfig.channelId = channel.id;
            welcomeConfig.set(interaction.guild.id, serverConfig);
            interaction.client.welcomeConfig = welcomeConfig;
            
            const successEmbed = new EmbedBuilder()
                .setColor('#43B581')
                .setTitle('✅ Messages de bienvenue réactivés')
                .setDescription(`Les messages de bienvenue ont été réactivés dans ${channel}.`)
                .setTimestamp();
                
            await modalSubmit.reply({ embeds: [successEmbed], ephemeral: true });
            
            // Mettre à jour le message original
            const updatedEmbed = new EmbedBuilder()
                .setColor('#43B581')
                .setTitle('✅ Messages de bienvenue réactivés')
                .setDescription(`Les messages de bienvenue sont maintenant activés dans ${channel}.`)
                .setTimestamp();
                
            await interaction.editReply({ embeds: [updatedEmbed], components: [] });
            
        } catch (error) {
            if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                console.log('Modal timeout ou annulé');
            } else {
                console.error('Erreur lors de la réactivation des messages de bienvenue:', error);
            }
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            // Désactiver le bouton après expiration
            const expiredRow = new ActionRowBuilder().addComponents(
                enableButton.setDisabled(true)
            );
            
            interaction.editReply({ components: [expiredRow] }).catch(() => {});
        }
    });
}

/**
 * Gère le test du message de bienvenue
 * @param {import('discord.js').CommandInteraction} interaction 
 * @param {Object} serverConfig 
 */
async function handleTestCommand(interaction, serverConfig) {
    if (!serverConfig.enabled) {
        return interaction.reply({
            content: '❌ Le système de messages de bienvenue est désactivé. Activez-le d\'abord avec `/welcome-config enable`.',
            ephemeral: true
        });
    }

    const channel = interaction.guild.channels.cache.get(serverConfig.channelId);
    if (!channel) {
        return interaction.reply({
            content: '❌ Le salon configuré pour les messages de bienvenue n\'existe plus. Veuillez reconfigurer le système.',
            ephemeral: true
        });
    }

    await interaction.reply({
        content: `🧪 Envoi d'un message de test dans ${channel}...`,
        ephemeral: true
    });

    await sendWelcomeMessage(interaction.member, channel, serverConfig, true);
}

/**
 * Affiche la configuration actuelle du système de messages de bienvenue
 * @param {import('discord.js').CommandInteraction} interaction 
 * @param {Object} serverConfig 
 */
async function handleStatusCommand(interaction, serverConfig) {
    const channel = serverConfig.channelId ? 
        interaction.guild.channels.cache.get(serverConfig.channelId) : null;

    const statusEmbed = new EmbedBuilder()
        .setColor(serverConfig.enabled ? '#43B581' : '#F04747')
        .setTitle('⚙️ Configuration des messages de bienvenue')
        .addFields(
            { name: '📊 Statut', value: serverConfig.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '📣 Salon', value: channel ? `${channel}` : 'Non configuré', inline: true },
            { name: '🎨 Couleur', value: serverConfig.embedColor || '#5865F2', inline: true },
            { name: '📝 Message', value: '```' + serverConfig.message + '```', inline: false },
            { name: '🖼️ Image personnalisée', value: serverConfig.withImage ? '✅ Activée' : '❌ Désactivée', inline: true }
        )
        .setTimestamp();

    if (serverConfig.enabled) {
        const customizeButton = new ButtonBuilder()
            .setCustomId('welcome_customize')
            .setLabel('✏️ Personnaliser')
            .setStyle(ButtonStyle.Primary);

        const testButton = new ButtonBuilder()
            .setCustomId('welcome_test')
            .setLabel('🧪 Tester')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(customizeButton, testButton);

        await interaction.reply({ embeds: [statusEmbed], components: [row] });

        // Mettre en place un collecteur pour les interactions avec les boutons
        const filter = i => i.user.id === interaction.user.id && 
                         (i.customId === 'welcome_customize' || i.customId === 'welcome_test');
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'welcome_customize') {
                const welcomeConfig = interaction.client.welcomeConfig || new Map();
                await showCustomizationMenu(i, serverConfig, welcomeConfig);
            } else if (i.customId === 'welcome_test') {
                await i.deferUpdate();
                const channel = interaction.guild.channels.cache.get(serverConfig.channelId);
                
                if (!channel) {
                    return i.followUp({
                        content: '❌ Le salon configuré pour les messages de bienvenue n\'existe plus. Veuillez reconfigurer le système.',
                        ephemeral: true
                    });
                }
                
                await i.followUp({
                    content: `🧪 Envoi d'un message de test dans ${channel}...`,
                    ephemeral: true
                });
                
                await sendWelcomeMessage(interaction.member, channel, serverConfig, true);
            }
        });

        collector.on('end', () => {
            // Désactiver les boutons après expiration
            const expiredRow = new ActionRowBuilder().addComponents(
                customizeButton.setDisabled(true),
                testButton.setDisabled(true)
            );
            
            interaction.editReply({ components: [expiredRow] }).catch(() => {});
        });
    } else {
        await interaction.reply({ embeds: [statusEmbed] });
    }
}

/**
 * Affiche le menu de personnalisation du message de bienvenue
 * @param {import('discord.js').ButtonInteraction} interaction 
 * @param {Object} serverConfig 
 * @param {Map} welcomeConfig 
 */
async function showCustomizationMenu(interaction, serverConfig, welcomeConfig) {
    const customizeEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('✏️ Personnalisation du message de bienvenue')
        .setDescription(`
            ### Variables disponibles:
            - \`{user}\` - Mentionne le nouveau membre
            - \`{username}\` - Affiche le nom du membre sans mention
            - \`{server}\` - Affiche le nom du serveur
            - \`{memberCount}\` - Affiche le nombre total de membres
            - \`{date}\` - Affiche la date d'arrivée
        `)
        .setFooter({ text: 'Cliquez sur un bouton pour modifier l\'élément correspondant' });

    const messageButton = new ButtonBuilder()
        .setCustomId('welcome_edit_message')
        .setLabel('📝 Message')
        .setStyle(ButtonStyle.Primary);

    const colorButton = new ButtonBuilder()
        .setCustomId('welcome_edit_color')
        .setLabel('🎨 Couleur')
        .setStyle(ButtonStyle.Primary);

    const imageButton = new ButtonBuilder()
        .setCustomId('welcome_toggle_image')
        .setLabel(serverConfig.withImage ? '🖼️ Désactiver l\'image' : '🖼️ Activer l\'image')
        .setStyle(serverConfig.withImage ? ButtonStyle.Danger : ButtonStyle.Success);

    const channelButton = new ButtonBuilder()
        .setCustomId('welcome_edit_channel')
        .setLabel('📣 Changer de salon')
        .setStyle(ButtonStyle.Secondary);

    const saveButton = new ButtonBuilder()
        .setCustomId('welcome_save')
        .setLabel('💾 Sauvegarder')
        .setStyle(ButtonStyle.Success);

    const row1 = new ActionRowBuilder().addComponents(messageButton, colorButton, imageButton);
    const row2 = new ActionRowBuilder().addComponents(channelButton, saveButton);

    await interaction.reply({ embeds: [customizeEmbed], components: [row1, row2], ephemeral: true });

    const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('welcome_');
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

    collector.on('collect', async i => {
        switch (i.customId) {
            case 'welcome_edit_message':
                const modal = new ModalBuilder()
                    .setCustomId('welcome_message_modal')
                    .setTitle('Modifier le message de bienvenue');

                const messageInput = new TextInputBuilder()
                    .setCustomId('welcome_message')
                    .setLabel('Message de bienvenue')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Exemple: Bienvenue {user} sur {server} !')
                    .setValue(serverConfig.message)
                    .setRequired(true)
                    .setMaxLength(2000);

                const titleInput = new TextInputBuilder()
                    .setCustomId('welcome_title')
                    .setLabel('Titre de l\'embed')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Exemple: Nouveau membre !')
                    .setValue(serverConfig.embedTitle)
                    .setRequired(true)
                    .setMaxLength(256);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('welcome_description')
                    .setLabel('Description de l\'embed')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Exemple: Bienvenue {user} sur notre serveur !')
                    .setValue(serverConfig.embedDescription)
                    .setRequired(true)
                    .setMaxLength(4000);

                const footerInput = new TextInputBuilder()
                    .setCustomId('welcome_footer')
                    .setLabel('Pied de page de l\'embed')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Exemple: Rejoins le {date}')
                    .setValue(serverConfig.embedFooter)
                    .setRequired(true)
                    .setMaxLength(2048);

                const row1 = new ActionRowBuilder().addComponents(messageInput);
                const row2 = new ActionRowBuilder().addComponents(titleInput);
                const row3 = new ActionRowBuilder().addComponents(descriptionInput);
                const row4 = new ActionRowBuilder().addComponents(footerInput);

                modal.addComponents(row1, row2, row3, row4);
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ 
                        filter: i => i.customId === 'welcome_message_modal',
                        time: 120000 
                    });

                    serverConfig.message = modalSubmit.fields.getTextInputValue('welcome_message');
                    serverConfig.embedTitle = modalSubmit.fields.getTextInputValue('welcome_title');
                    serverConfig.embedDescription = modalSubmit.fields.getTextInputValue('welcome_description');
                    serverConfig.embedFooter = modalSubmit.fields.getTextInputValue('welcome_footer');

                    await modalSubmit.reply({ 
                        content: '✅ Message de bienvenue mis à jour. N\'oubliez pas de sauvegarder les changements !', 
                        ephemeral: true 
                    });
                } catch (error) {
                    if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                        console.log('Modal timeout ou annulé');
                    } else {
                        console.error('Erreur lors de la modification du message de bienvenue:', error);
                    }
                }
                break;

            case 'welcome_edit_color':
                const colorModal = new ModalBuilder()
                    .setCustomId('welcome_color_modal')
                    .setTitle('Modifier la couleur de l\'embed');

                const colorInput = new TextInputBuilder()
                    .setCustomId('welcome_color')
                    .setLabel('Code couleur hexadécimal')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Exemple: #5865F2')
                    .setValue(serverConfig.embedColor)
                    .setRequired(true)
                    .setMinLength(7)
                    .setMaxLength(7);

                const colorRow = new ActionRowBuilder().addComponents(colorInput);
                colorModal.addComponents(colorRow);

                await i.showModal(colorModal);

                try {
                    const colorSubmit = await i.awaitModalSubmit({ 
                        filter: i => i.customId === 'welcome_color_modal',
                        time: 60000 
                    });

                    const colorValue = colorSubmit.fields.getTextInputValue('welcome_color');
                    // Vérifier que la couleur est un code hexadécimal valide
                    if (!/^#[0-9A-F]{6}$/i.test(colorValue)) {
                        return colorSubmit.reply({
                            content: '❌ Format de couleur invalide. Veuillez utiliser un code hexadécimal valide (ex: #5865F2).',
                            ephemeral: true
                        });
                    }

                    serverConfig.embedColor = colorValue;
                    await colorSubmit.reply({ 
                        content: '✅ Couleur de l\'embed mise à jour. N\'oubliez pas de sauvegarder les changements !', 
                        ephemeral: true 
                    });
                } catch (error) {
                    if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                        console.log('Modal timeout ou annulé');
                    } else {
                        console.error('Erreur lors de la modification de la couleur:', error);
                    }
                }
                break;

            case 'welcome_toggle_image':
                serverConfig.withImage = !serverConfig.withImage;
                await i.update({
                    components: [
                        new ActionRowBuilder().addComponents(
                            messageButton,
                            colorButton,
                            new ButtonBuilder()
                                .setCustomId('welcome_toggle_image')
                                .setLabel(serverConfig.withImage ? '🖼️ Désactiver l\'image' : '🖼️ Activer l\'image')
                                .setStyle(serverConfig.withImage ? ButtonStyle.Danger : ButtonStyle.Success)
                        ),
                        row2
                    ]
                });
                break;

            case 'welcome_edit_channel':
                const channelModal = new ModalBuilder()
                    .setCustomId('welcome_channel_modal')
                    .setTitle('Changer le salon de bienvenue');

                const channelInput = new TextInputBuilder()
                    .setCustomId('welcome_channel')
                    .setLabel('ID ou nom du salon')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Exemple: 123456789012345678 ou bienvenue')
                    .setRequired(true);

                const channelRow = new ActionRowBuilder().addComponents(channelInput);
                channelModal.addComponents(channelRow);

                await i.showModal(channelModal);

                try {
                    const channelSubmit = await i.awaitModalSubmit({ 
                        filter: i => i.customId === 'welcome_channel_modal',
                        time: 60000 
                    });

                    const channelInput = channelSubmit.fields.getTextInputValue('welcome_channel');
                    let channel;
                    
                    // Essayer de trouver le salon par ID
                    if (/^\d+$/.test(channelInput)) {
                        channel = interaction.guild.channels.cache.get(channelInput);
                    }
                    
                    // Sinon, essayer de trouver le salon par nom
                    if (!channel) {
                        channel = interaction.guild.channels.cache.find(
                            ch => ch.name.toLowerCase() === channelInput.toLowerCase() && 
                            ch.type === ChannelType.GuildText
                        );
                    }
                    
                    if (!channel) {
                        return channelSubmit.reply({
                            content: '❌ Salon introuvable. Veuillez réessayer avec un ID ou un nom valide.',
                            ephemeral: true
                        });
                    }
                    
                    // Vérifier les permissions
                    const permissions = channel.permissionsFor(interaction.guild.members.me);
                    if (!permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
                        return channelSubmit.reply({
                            content: `❌ Je n'ai pas les permissions nécessaires pour envoyer des messages dans ${channel}.`,
                            ephemeral: true
                        });
                    }
                    
                    serverConfig.channelId = channel.id;
                    await channelSubmit.reply({
                        content: `✅ Salon de bienvenue changé pour ${channel}. N'oubliez pas de sauvegarder les changements !`,
                        ephemeral: true
                    });
                } catch (error) {
                    if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                        console.log('Modal timeout ou annulé');
                    } else {
                        console.error('Erreur lors du changement de salon:', error);
                    }
                }
                break;

            case 'welcome_save':
                welcomeConfig.set(interaction.guild.id, serverConfig);
                interaction.client.welcomeConfig = welcomeConfig;
                
                const savedEmbed = new EmbedBuilder()
                    .setColor('#43B581')
                    .setTitle('✅ Configuration sauvegardée')
                    .setDescription('Les paramètres des messages de bienvenue ont été sauvegardés.')
                    .setTimestamp();
                    
                await i.update({ embeds: [savedEmbed], components: [] });
                collector.stop();
                break;
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason !== 'messageDelete' && reason !== 'user') {
            interaction.editReply({ 
                content: 'Cette session de configuration est terminée.', 
                components: [], 
                ephemeral: true 
            }).catch(() => {});
        }
    });
}

/**
 * Envoie un message de bienvenue pour un membre
 * @param {import('discord.js').GuildMember} member - Le membre qui a rejoint
 * @param {import('discord.js').TextChannel} channel - Le salon où envoyer le message
 * @param {Object} config - La configuration des messages de bienvenue
 * @param {boolean} isTest - Indique s'il s'agit d'un test
 */
async function sendWelcomeMessage(member, channel, config, isTest = false) {
    try {
        // Formatage des variables
        const formattedMessage = formatWelcomeMessage(config.message, member, isTest);
        const formattedTitle = formatWelcomeMessage(config.embedTitle, member, isTest);
        const formattedDescription = formatWelcomeMessage(config.embedDescription, member, isTest);
        const formattedFooter = formatWelcomeMessage(config.embedFooter, member, isTest);

        // Création de l'embed
        const welcomeEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(formattedTitle)
            .setDescription(formattedDescription)
            .setFooter({ text: formattedFooter })
            .setTimestamp();

        // Ajouter l'avatar du membre si disponible
        if (member.user.displayAvatarURL()) {
            welcomeEmbed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
        }

        // Ajouter une image de bienvenue si activée
        if (config.withImage) {
            // Utiliser un service d'image plus fiable et personnalisable
            const imageUrl = `https://api.popcat.xyz/welcomecard?background=https://i.imgur.com/8BOiOqD.png&text1=${encodeURIComponent(member.user.username)}&text2=Bienvenue+sur+${encodeURIComponent(member.guild.name)}&text3=Membre+${encodeURIComponent(member.guild.memberCount)}&avatar=${encodeURIComponent(member.user.displayAvatarURL({ dynamic: false, format: 'png' }))}`;
            welcomeEmbed.setImage(imageUrl);
        }

        // Ajouter la date d'inscription du compte Discord
        const createdAt = new Date(member.user.createdAt);
        const createdAtFormatted = createdAt.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        welcomeEmbed.addFields({ 
            name: '📅 Compte Discord créé le', 
            value: createdAtFormatted, 
            inline: true 
        });

        // Ajouter un champ pour les rôles par défaut si le membre en a reçu
        if (member.roles.cache.size > 1) { // Plus de 1 car @everyone est toujours présent
            const roleList = member.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => `<@&${role.id}>`)
                .join(', ');
                
            if (roleList.length > 0) {
                welcomeEmbed.addFields({ 
                    name: '🏷️ Rôles attribués', 
                    value: roleList,
                    inline: true 
                });
            }
        }

        // Ajouter un indicateur si c'est un test
        if (isTest) {
            welcomeEmbed.addFields({ 
                name: '🧪 Test', 
                value: 'Ceci est un message de test.' 
            });
        }

        // Envoi du message
        await channel.send({
            content: formattedMessage,
            embeds: [welcomeEmbed]
        });

        return true;
    } catch (error) {
        console.error('Erreur lors de l\'envoi du message de bienvenue:', error);
        return false;
    }
}

/**
 * Envoie un message de bienvenue de test
 * @param {import('discord.js').ButtonInteraction} interaction 
 * @param {Object} serverConfig 
 */
async function sendTestWelcomeMessage(interaction, serverConfig) {
    await interaction.deferUpdate();
    
    const channel = interaction.guild.channels.cache.get(serverConfig.channelId);
    
    if (!channel) {
        return interaction.followUp({
            content: '❌ Le salon configuré pour les messages de bienvenue n\'existe plus. Veuillez reconfigurer le système.',
            ephemeral: true
        });
    }
    
    await interaction.followUp({
        content: `🧪 Envoi d'un message de test dans ${channel}...`,
        ephemeral: true
    });
    
    await sendWelcomeMessage(interaction.member, channel, serverConfig, true);
}

/**
 * Formate un message de bienvenue avec les variables de remplacement
 * @param {string} message - Le message à formater
 * @param {import('discord.js').GuildMember} member - Le membre qui a rejoint
 * @param {boolean} isTest - Indique s'il s'agit d'un test
 * @returns {string} Le message formaté
 */
function formatWelcomeMessage(message, member, isTest) {
    const currentDate = new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return message
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{username}/g, member.user.username)
        .replace(/{server}/g, member.guild.name)
        .replace(/{memberCount}/g, member.guild.memberCount)
        .replace(/{date}/g, currentDate)
        .replace(/{test}/g, isTest ? '(TEST)' : '')
        .replace(/{year}/g, new Date().getFullYear().toString());
}

// Cette fonction doit être exportée pour être utilisée dans l'événement guildMemberAdd
module.exports.sendWelcomeMessage = sendWelcomeMessage;
