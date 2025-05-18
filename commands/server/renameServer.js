const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, 
    ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rename-server')
        .setDescription('Renomme le serveur avec un nouveau nom 🎉')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Vérifier les permissions de l'utilisateur
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas la permission de renommer ce serveur.',
                ephemeral: true
            });
        }

        // Créer les boutons d'action
        const renameButton = new ButtonBuilder()
            .setCustomId('nouveau-nom')
            .setLabel('✏️ Choisir le nouveau nom')
            .setStyle(ButtonStyle.Primary);
            
        const cancelButton = new ButtonBuilder()
            .setCustomId('annuler')
            .setLabel('❌ Annuler')
            .setStyle(ButtonStyle.Danger);
            
        const infoButton = new ButtonBuilder()
            .setCustomId('info-rename')
            .setLabel('ℹ️ Informations')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(renameButton, infoButton, cancelButton);

        // Créer l'embed principal
        const embed = new EmbedBuilder()
            .setColor('#A8DADC')
            .setTitle('🏷️ Renommer le serveur')
            .setDescription(`
                ### Bienvenue dans l'outil de renommage de serveur!
                
                Vous pouvez renommer votre serveur en cliquant sur le bouton ci-dessous.
                
                **Serveur actuel:** ${interaction.guild.name}
                **Date du dernier changement:** ${new Date(interaction.guild.nameUpdatedAt || interaction.guild.createdTimestamp).toLocaleString('fr-FR')}
            `)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
            .setTimestamp()
            .setFooter({ 
                text: `Demandé par ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        // Envoyer le message initial
        await interaction.reply({ embeds: [embed], components: [row] });

        // Configurer le collecteur pour les interactions
        const filter = i => ['nouveau-nom', 'annuler', 'info-rename'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 180000 }); // 3 minutes

        collector.on('collect', async i => {
            switch (i.customId) {
                case 'nouveau-nom':
                    await handleRenameRequest(i);
                    break;
                case 'annuler':
                    await handleCancelRequest(i, collector);
                    break;
                case 'info-rename':
                    await handleInfoRequest(i);
                    break;
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                // Désactiver les boutons quand le temps est écoulé
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        renameButton.setDisabled(true),
                        infoButton.setDisabled(true),
                        cancelButton.setDisabled(true)
                    );

                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#747F8D')
                    .setTitle('⌛ Temps écoulé')
                    .setDescription('La session de renommage a expiré. Veuillez relancer la commande si vous souhaitez renommer le serveur.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [timeoutEmbed], components: [disabledRow] }).catch(() => {});
            }
        });

        /**
         * Gère la demande de renommage
         * @param {ButtonInteraction} i - L'interaction bouton
         */
        async function handleRenameRequest(i) {
            // Créer un modal pour saisir le nouveau nom
            const modal = new ModalBuilder()
                .setCustomId('modal-rename-server')
                .setTitle('Renommer le serveur');

            const serverNameInput = new TextInputBuilder()
                .setCustomId('serverName')
                .setLabel('Nouveau nom du serveur')
                .setPlaceholder('Entrez le nouveau nom du serveur (max 100 caractères)')
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(100)
                .setValue(interaction.guild.name)
                .setRequired(true);

            const reasonInput = new TextInputBuilder()
                .setCustomId('renameReason')
                .setLabel('Raison du changement (facultatif)')
                .setPlaceholder('Pourquoi souhaitez-vous renommer le serveur?')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(500)
                .setRequired(false);

            const firstRow = new ActionRowBuilder().addComponents(serverNameInput);
            const secondRow = new ActionRowBuilder().addComponents(reasonInput);

            modal.addComponents(firstRow, secondRow);
            await i.showModal(modal);

            // Attendre que l'utilisateur soumette le modal
            try {
                const modalSubmit = await i.awaitModalSubmit({
                    filter: (i) => i.customId === 'modal-rename-server',
                    time: 180000 // 3 minutes
                });

                const newName = modalSubmit.fields.getTextInputValue('serverName');
                const reason = modalSubmit.fields.getTextInputValue('renameReason') || 'Aucune raison spécifiée';

                try {
                    // Sauvegarder l'ancien nom pour référence
                    const oldName = interaction.guild.name;
                    
                    // Renommer le serveur
                    await interaction.guild.setName(newName, reason);
                    
                    // Création de l'embed de confirmation
                    const successEmbed = new EmbedBuilder()
                        .setColor('#43B581')
                        .setTitle('✅ Serveur renommé avec succès!')
                        .setDescription(`
                            ### Le serveur a été renommé!
                            
                            **Ancien nom:** ${oldName}
                            **Nouveau nom:** ${newName}
                            **Raison:** ${reason}
                            
                            Le changement est effectif immédiatement. Tous les membres verront le nouveau nom.
                        `)
                        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                        .setTimestamp()
                        .setFooter({ 
                            text: `Renommé par ${interaction.user.tag}`, 
                            iconURL: interaction.user.displayAvatarURL() 
                        });

                    // Désactiver les boutons après le succès
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            renameButton.setDisabled(true),
                            infoButton.setDisabled(true),
                            cancelButton.setDisabled(true)
                        );

                    // Répondre au modal
                    await modalSubmit.reply({ 
                        content: '✨ Changement de nom effectué! Le message original a été mis à jour.',
                        ephemeral: true 
                    });
                    
                    // Mettre à jour le message original
                    await interaction.editReply({ 
                        embeds: [successEmbed], 
                        components: [disabledRow] 
                    });
                    
                    // Arrêter le collecteur car l'opération est terminée
                    collector.stop('completed');
                    
                } catch (error) {
                    console.error('Erreur lors du renommage du serveur:', error);
                    
                    await modalSubmit.reply({
                        content: `❌ Une erreur s'est produite lors du renommage du serveur: ${error.message}`,
                        ephemeral: true
                    });
                }
                
            } catch (error) {
                if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                    console.log('Modal timeout ou annulé');
                } else {
                    console.error('Erreur lors de l\'attente du modal:', error);
                }
            }
        }

        /**
         * Gère l'annulation de la demande
         * @param {ButtonInteraction} i - L'interaction bouton
         * @param {InteractionCollector} collector - Le collecteur d'interactions
         */
        async function handleCancelRequest(i, collector) {
            const cancelEmbed = new EmbedBuilder()
                .setColor('#F04747')
                .setTitle('❌ Action annulée')
                .setDescription('Le renommage du serveur a été annulé.')
                .setTimestamp();

            // Désactiver les boutons après annulation
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    renameButton.setDisabled(true),
                    infoButton.setDisabled(true),
                    cancelButton.setDisabled(true)
                );

            await i.update({ 
                embeds: [cancelEmbed], 
                components: [disabledRow] 
            });
            
            collector.stop('cancelled');
        }

        /**
         * Affiche des informations supplémentaires
         * @param {ButtonInteraction} i - L'interaction bouton
         */
        async function handleInfoRequest(i) {
            const infoEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('ℹ️ Informations sur le renommage de serveur')
                .setDescription(`
                    ### Limitations et bonnes pratiques
                    
                    - Le nom du serveur doit comporter entre 2 et 100 caractères
                    - Discord peut rejeter certains noms inappropriés
                    - Les changements fréquents peuvent perturber vos membres
                    - Un bon nom de serveur doit être descriptif et mémorable
                    
                    ### Impact du renommage
                    
                    - Le lien d'invitation permanent n'est pas affecté
                    - Les membres verront le nouveau nom immédiatement
                    - Le changement apparaît dans les logs d'audit du serveur
                `)
                .setTimestamp();

            await i.reply({ 
                embeds: [infoEmbed], 
                ephemeral: true 
            });
        }
    }
};