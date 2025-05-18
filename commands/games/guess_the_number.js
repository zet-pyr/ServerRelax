const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, 
    ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guess-the-number')
        .setDescription('Jouez à un jeu de devinette de nombre ! 🎲')
        .addIntegerOption(option => 
            option.setName('min')
                .setDescription('Nombre minimum (par défaut: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(999))
        .addIntegerOption(option => 
            option.setName('max')
                .setDescription('Nombre maximum (par défaut: 100)')
                .setRequired(false)
                .setMinValue(10)
                .setMaxValue(1000)),
    
    async execute(interaction) {
        // Configuration des limites du jeu
        const minNumber = interaction.options.getInteger('min') || 1;
        const maxNumber = interaction.options.getInteger('max') || 100;

        // Vérifier que min est inférieur à max
        if (minNumber >= maxNumber) {
            return interaction.reply({ 
                content: '❌ **Erreur:** Le nombre minimum doit être inférieur au nombre maximum!', 
                ephemeral: true 
            });
        }
        
        const launchGamesButton = new ButtonBuilder()
            .setCustomId('launch-games')
            .setLabel('🎮 Lancer le jeu')
            .setStyle(ButtonStyle.Primary);
            
        const stopGamesButton = new ButtonBuilder()
            .setCustomId('stop-games')
            .setLabel('❌ Quitter')
            .setStyle(ButtonStyle.Danger);
            
        const rulesButton = new ButtonBuilder()
            .setCustomId('show-rules')
            .setLabel('📜 Règles')
            .setStyle(ButtonStyle.Secondary);
            
        const row = new ActionRowBuilder()
            .addComponents(launchGamesButton, rulesButton, stopGamesButton);
            
        const embed = new EmbedBuilder()
            .setColor('#A8DADC')
            .setTitle('🎮 Jeu de devinette de nombre')
            .setDescription(`
                ### 🎲 Bienvenue dans Guess The Number! 🎲
                
                🔢 Votre mission: Deviner le nombre secret entre **${minNumber}** et **${maxNumber}**!
                
                🏆 Voyez combien d'essais il vous faudra pour trouver le bon nombre.
                
                📊 À chaque essai, vous saurez si votre proposition est trop haute ou trop basse.
                
                🚀 Cliquez sur "Lancer le jeu" pour commencer!
            `)
            .setFooter({ text: '🎯 Bonne chance et amusez-vous bien!' })
            .setTimestamp();
            
        await interaction.reply({ embeds: [embed], components: [row] });
        
        const filter = i => (i.customId === 'launch-games' || i.customId === 'stop-games' || i.customId === 'show-rules') && 
                          i.user.id === interaction.user.id;
                          
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 120000 });
        
        collector.on('collect', async i => {
            if (i.customId === 'launch-games') {
                // Arrêter le collecteur initial
                collector.stop('game_started');
                
                // Lancer le jeu
                await startGame(i, minNumber, maxNumber);
                
            } else if (i.customId === 'stop-games') {
                const cancelEmbed = new EmbedBuilder()
                    .setColor('#F04747')
                    .setTitle('❌ Jeu annulé')
                    .setDescription('Vous avez quitté le jeu. À bientôt pour une nouvelle partie!')
                    .setTimestamp();
                    
                await i.update({ embeds: [cancelEmbed], components: [] });
                collector.stop('cancelled');
                
            } else if (i.customId === 'show-rules') {
                const rulesEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📜 Règles du jeu')
                    .setDescription(`
                        ### 📋 Comment jouer à Guess The Number
                        
                        1️⃣ Le jeu choisit aléatoirement un nombre entre **${minNumber}** et **${maxNumber}**
                        
                        2️⃣ À chaque tour, vous proposez un nombre
                        
                        3️⃣ Le bot vous dira si votre nombre est:
                           🔼 Trop haut
                           🔽 Trop bas
                           ✅ Correct
                        
                        4️⃣ Votre objectif est de trouver le nombre avec le moins d'essais possible!
                        
                        💡 **Astuce:** Utilisez la stratégie de la recherche binaire pour trouver plus vite!
                    `)
                    .setFooter({ text: '🧠 Une bonne stratégie peut vous faire gagner en moins de 7 essais!' });
                    
                await i.reply({ embeds: [rulesEmbed], ephemeral: true });
            }
        });
        
        collector.on('end', (collected, reason) => {
            if (reason !== 'game_started' && reason !== 'cancelled') {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#747F8D')
                    .setTitle('⏰ Temps écoulé')
                    .setDescription('La session a expiré par inactivité.')
                    .setTimestamp();
                    
                interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
        
        /**
         * Démarre une nouvelle partie de Guess The Number
         * @param {ButtonInteraction} i - L'interaction du bouton
         * @param {number} min - La valeur minimum
         * @param {number} max - La valeur maximum
         */
        async function startGame(i, min, max) {
            // Générer le nombre secret
            const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
            console.log(`[DEBUG] Nombre secret: ${randomNumber}`); // Pour le débogage
            
            // Variables de jeu
            let attempts = 0;
            let gameActive = true;
            let history = [];
            
            // Créer le bouton de proposition
            const guessButton = new ButtonBuilder()
                .setCustomId('guess-number')
                .setLabel('🔢 Faire une proposition')
                .setStyle(ButtonStyle.Primary);
                
            const hintButton = new ButtonBuilder()
                .setCustomId('get-hint')
                .setLabel('💡 Indice')
                .setStyle(ButtonStyle.Secondary);
                
            const surrenderButton = new ButtonBuilder()
                .setCustomId('surrender')
                .setLabel('🏳️ Abandonner')
                .setStyle(ButtonStyle.Danger);
                
            const guessRow = new ActionRowBuilder()
                .addComponents(guessButton, hintButton, surrenderButton);
            
            // Créer l'embed de jeu
            const gameEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎮 Partie en cours')
                .setDescription(`
                    ### 🎯 Trouvez le nombre entre **${min}** et **${max}**!
                    
                    🔢 **Tentatives:** ${attempts}
                    📊 **Dernières propositions:** Aucune
                    
                    Cliquez sur "Faire une proposition" pour soumettre un nombre.
                `)
                .setFooter({ text: '🧩 Utilisez la logique pour trouver le nombre le plus rapidement possible!' })
                .setTimestamp();
                
            await i.update({ embeds: [gameEmbed], components: [guessRow] });
            
            // Créer un nouveau collecteur pour le jeu
            const gameFilter = i => ['guess-number', 'get-hint', 'surrender'].includes(i.customId) && 
                               i.user.id === interaction.user.id;
                               
            const gameCollector = interaction.channel.createMessageComponentCollector({ 
                gameFilter, 
                time: 300000 // 5 minutes
            });
            
            gameCollector.on('collect', async i => {
                if (!gameActive) return;
                
                if (i.customId === 'guess-number') {
                    // Afficher un modal pour entrer le nombre
                    const modal = new ModalBuilder()
                        .setCustomId('guess-modal')
                        .setTitle('🔢 Devinez le nombre');
                        
                    const guessInput = new TextInputBuilder()
                        .setCustomId('guess-input')
                        .setLabel(`Entrez un nombre entre ${min} et ${max}`)
                        .setPlaceholder('Votre proposition...')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(4);
                        
                    // Correction: Utiliser correctement ActionRowBuilder avec le type générique
                    const modalRow = new ActionRowBuilder().addComponents(guessInput);
                    
                    // S'assurer que le ActionRowBuilder est correctement typé pour le modal
                    modal.addComponents(modalRow);
                    
                    await i.showModal(modal);
                    
                    try {
                        // Attendre la soumission du modal
                        const modalInteraction = await i.awaitModalSubmit({
                            filter: i => i.customId === 'guess-modal',
                            time: 60000
                        });
                        
                        // Récupérer et valider la proposition
                        const guessString = modalInteraction.fields.getTextInputValue('guess-input');
                        const userGuess = parseInt(guessString);
                        
                        if (isNaN(userGuess) || userGuess < min || userGuess > max) {
                            await modalInteraction.reply({ 
                                content: `⚠️ **Nombre invalide!** Veuillez entrer un nombre entre ${min} et ${max}.`,
                                ephemeral: true
                            });
                            return;
                        }
                        
                        // Incrémenter le compteur d'essais
                        attempts++;
                        
                        // Ajouter à l'historique
                        const result = userGuess === randomNumber ? '✅' : 
                                      userGuess < randomNumber ? '🔽 Trop bas' : '🔼 Trop haut';
                        history.unshift(`${userGuess} - ${result}`);
                        if (history.length > 5) history.pop();
                        
                        // Vérifier si la proposition est correcte
                        if (userGuess === randomNumber) {
                            gameActive = false;
                            
                            // Créer un embed de victoire
                            const victoryEmbed = new EmbedBuilder()
                                .setColor('#43B581')
                                .setTitle('🎉 VICTOIRE! 🎉')
                                .setDescription(`
                                    ### 🏆 Félicitations! Vous avez trouvé le nombre!
                                    
                                    ✨ **Le nombre était:** ${randomNumber}
                                    🔢 **Nombre d'essais:** ${attempts}
                                    ${getRatingMessage(attempts, min, max)}
                                    
                                    📊 **Historique:**
                                    ${history.map(h => `- ${h}`).join('\n')}
                                    
                                    🎮 Merci d'avoir joué! Voulez-vous recommencer?
                                `)
                                .setTimestamp();
                                
                            // Bouton pour rejouer
                            const replayButton = new ButtonBuilder()
                                .setCustomId('replay-game')
                                .setLabel('🔄 Rejouer')
                                .setStyle(ButtonStyle.Success);
                                
                            const endButton = new ButtonBuilder()
                                .setCustomId('end-game')
                                .setLabel('👋 Terminer')
                                .setStyle(ButtonStyle.Secondary);
                                
                            const replayRow = new ActionRowBuilder()
                                .addComponents(replayButton, endButton);
                                
                            await modalInteraction.reply({
                                content: `🎊 **BRAVO!** Vous avez trouvé le nombre ${randomNumber} en ${attempts} essais!`,
                                ephemeral: true
                            });
                            
                            await interaction.editReply({
                                embeds: [victoryEmbed],
                                components: [replayRow]
                            });
                            
                            // Arrêter le collecteur
                            gameCollector.stop('victory');
                            
                            // Configurer un nouveau collecteur pour le replay
                            const replayFilter = i => ['replay-game', 'end-game'].includes(i.customId) && 
                                                   i.user.id === interaction.user.id;
                                                   
                            const replayCollector = interaction.channel.createMessageComponentCollector({
                                filter: replayFilter,
                                time: 60000
                            });
                            
                            replayCollector.on('collect', async i => {
                                if (i.customId === 'replay-game') {
                                    await i.update({ content: '🔄 Préparation d\'une nouvelle partie...', embeds: [], components: [] });
                                    // Relancer le jeu
                                    setTimeout(() => startGame(i, min, max), 1000);
                                } else {
                                    const thankEmbed = new EmbedBuilder()
                                        .setColor('#5865F2')
                                        .setTitle('👋 Merci d\'avoir joué!')
                                        .setDescription('À bientôt pour une nouvelle partie!')
                                        .setTimestamp();
                                        
                                    await i.update({ embeds: [thankEmbed], components: [] });
                                    replayCollector.stop();
                                }
                            });
                            
                        } else {
                            // Créer un embed mis à jour avec l'historique des propositions
                            const updatedEmbed = new EmbedBuilder()
                                .setColor('#5865F2')
                                .setTitle('🎮 Partie en cours')
                                .setDescription(`
                                    ### 🎯 Trouvez le nombre entre **${min}** et **${max}**!
                                    
                                    🔢 **Tentatives:** ${attempts}
                                    ${getProgressBar(min, max, history, randomNumber)}
                                    
                                    📊 **Dernières propositions:**
                                    ${history.map(h => `- ${h}`).join('\n')}
                                    
                                    ${userGuess < randomNumber ? 
                                        '🔼 **Indice:** Le nombre est **plus grand** que votre proposition!' : 
                                        '🔽 **Indice:** Le nombre est **plus petit** que votre proposition!'}
                                `)
                                .setFooter({ text: `Essai ${attempts} - Continuez, vous vous rapprochez!` })
                                .setTimestamp();
                                
                            await modalInteraction.reply({
                                content: userGuess < randomNumber ? 
                                    '🔼 **Trop bas!** Le nombre est plus grand.' : 
                                    '🔽 **Trop haut!** Le nombre est plus petit.',
                                ephemeral: true
                            });
                            
                            await interaction.editReply({
                                embeds: [updatedEmbed],
                                components: [guessRow]
                            });
                        }
                        
                    } catch (error) {
                        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                            console.log('Modal timeout ou annulé');
                        } else {
                            console.error('Erreur de modal:', error);
                        }
                    }
                    
                } else if (i.customId === 'get-hint') {
                    // Donner un indice
                    let hint = '';
                    
                    if (history.length === 0) {
                        // Premier indice basé sur la parité
                        hint = randomNumber % 2 === 0 ? 
                            '🧩 **Indice:** Le nombre est **pair**.' : 
                            '🧩 **Indice:** Le nombre est **impair**.';
                    } else {
                        // Calculer un indice basé sur la distance
                        const range = max - min;
                        const segment = Math.floor(range / 10);
                        
                        if (segment > 0) {
                            const lowerBound = Math.max(min, randomNumber - segment);
                            const upperBound = Math.min(max, randomNumber + segment);
                            hint = `🧩 **Indice:** Le nombre se trouve entre **${lowerBound}** et **${upperBound}**.`;
                        } else {
                            hint = '🧩 **Indice:** Vous êtes dans un petit intervalle, essayez tous les nombres!';
                        }
                    }
                    
                    await i.reply({ content: hint, ephemeral: true });
                    
                } else if (i.customId === 'surrender') {
                    gameActive = false;
                    
                    const surrenderEmbed = new EmbedBuilder()
                        .setColor('#F04747')
                        .setTitle('🏳️ Partie abandonnée')
                        .setDescription(`
                            ### Vous avez abandonné la partie
                            
                            ❓ **Le nombre secret était:** ${randomNumber}
                            🔢 **Nombre d'essais effectués:** ${attempts}
                            
                            N'hésitez pas à réessayer quand vous voulez!
                        `)
                        .setTimestamp();
                        
                    const replayButton = new ButtonBuilder()
                        .setCustomId('replay-game')
                        .setLabel('🔄 Nouvelle partie')
                        .setStyle(ButtonStyle.Primary);
                        
                    const endButton = new ButtonBuilder()
                        .setCustomId('end-game')
                        .setLabel('👋 Quitter')
                        .setStyle(ButtonStyle.Secondary);
                        
                    const replayRow = new ActionRowBuilder()
                        .addComponents(replayButton, endButton);
                        
                    await i.update({
                        embeds: [surrenderEmbed],
                        components: [replayRow]
                    });
                    
                    gameCollector.stop('surrendered');
                }
            });
            
            gameCollector.on('end', (collected, reason) => {
                if (reason !== 'victory' && reason !== 'surrendered' && gameActive) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('#747F8D')
                        .setTitle('⏰ Temps écoulé')
                        .setDescription(`
                            ### La partie a été interrompue pour cause d'inactivité
                            
                            ❓ **Le nombre secret était:** ${randomNumber}
                            🔢 **Nombre d'essais effectués:** ${attempts}
                        `)
                        .setTimestamp();
                        
                    interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                }
            });
        }
        
        /**
         * Génère un message d'évaluation basé sur le nombre d'essais
         * @param {number} attempts - Nombre d'essais
         * @param {number} min - Valeur minimum
         * @param {number} max - Valeur maximum
         * @returns {string} Message d'évaluation
         */
        function getRatingMessage(attempts, min, max) {
            const range = max - min;
            const log2Range = Math.log2(range);
            const perfectScore = Math.ceil(log2Range);
            
            if (attempts <= perfectScore) {
                return `🌟 **Performance:** Extraordinaire! Vous avez trouvé en un nombre optimal d'essais!`;
            } else if (attempts <= perfectScore + 2) {
                return `⭐ **Performance:** Excellente! Presque parfait!`;
            } else if (attempts <= perfectScore + 5) {
                return `👍 **Performance:** Bonne performance!`;
            } else if (attempts <= perfectScore + 10) {
                return `👌 **Performance:** Pas mal, mais vous pouvez faire mieux!`;
            } else {
                return `🙂 **Performance:** Vous avez réussi, continuez à vous entraîner!`;
            }
        }
        
        /**
         * Génère une barre de progression visuelle
         * @param {number} min - Valeur minimum
         * @param {number} max - Valeur maximum
         * @param {Array} history - Historique des propositions
         * @param {number} target - Le nombre à deviner
         * @returns {string} Barre de progression HTML
         */
        function getProgressBar(min, max, history, target) {
            if (history.length === 0) return '';
            
            const lastGuessStr = history[0].split(' - ')[0];
            const lastGuess = parseInt(lastGuessStr);
            const range = max - min;
            
            // Calculer la proximité en pourcentage
            const distance = Math.abs(lastGuess - target);
            const proximity = 100 - Math.min(100, (distance / range) * 100);
            
            // Créer un message basé sur la proximité
            let message = '';
            if (proximity >= 95) {
                message = '🔥 **Brûlant!** Vous y êtes presque!';
            } else if (proximity >= 85) {
                message = '🔥 **Très chaud!** Vous vous rapprochez!';
            } else if (proximity >= 70) {
                message = '♨️ **Chaud!** Continuez dans cette direction!';
            } else if (proximity >= 50) {
                message = '🌡️ **Tiède!** Vous êtes sur la bonne voie.';
            } else if (proximity >= 30) {
                message = '❄️ **Frais!** Vous vous éloignez un peu.';
            } else if (proximity >= 15) {
                message = '❄️ **Froid!** Vous êtes loin du compte.';
            } else {
                message = '🧊 **Glacial!** Vous êtes très loin.';
            }
            
            return message;
        }
    }
};