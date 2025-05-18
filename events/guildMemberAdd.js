const { sendWelcomeMessage } = require('../commands/server/setWelcomeMessage');

module.exports = {
    name: 'guildMemberAdd',
    once: false,
    async execute(member, client) {
        try {
            // Logs détaillés pour le débogage
            console.log(`🔔 Événement guildMemberAdd déclenché`);
            console.log(`👋 Nouveau membre: ${member.user.tag} (${member.id}) a rejoint ${member.guild.name} (${member.guild.id})`);
            console.log(`ℹ️ Type de membre: ${member.user.bot ? 'Bot' : 'Utilisateur'}`);
            
            // Vérifier que le client est bien défini et disponible
            if (!client) {
                console.error(`❌ Erreur: Le client n'est pas disponible dans l'événement guildMemberAdd`);
                return;
            }
            
            // Vérifier la configuration du système de bienvenue
            console.log(`🔍 Recherche de configuration pour le serveur ${member.guild.id}`);
            const welcomeConfig = client.welcomeConfig || new Map();
            
            // Logs de débogage pour la configuration
            console.log(`📊 État de la configuration: ${welcomeConfig instanceof Map ? 'Map valide' : 'Invalide'}`);
            console.log(`📋 Nombre de serveurs configurés: ${welcomeConfig.size}`);
            console.log(`🔑 Serveurs configurés: ${Array.from(welcomeConfig.keys()).join(', ') || 'Aucun'}`);
            
            // Récupérer la configuration spécifique au serveur
            const serverConfig = welcomeConfig.get(member.guild.id);
            console.log(`⚙️ Configuration trouvée pour ${member.guild.name}: ${serverConfig ? 'Oui' : 'Non'}`);
            
            // Si aucune configuration n'est trouvée, on sort
            if (!serverConfig) {
                console.log(`ℹ️ Aucune configuration de bienvenue trouvée pour ${member.guild.name}`);
                return;
            }
            
            // Vérifier si la configuration est activée
            console.log(`🔌 État du système: ${serverConfig.enabled ? 'Activé' : 'Désactivé'}`);
            if (!serverConfig.enabled) {
                console.log(`ℹ️ Les messages de bienvenue sont désactivés pour ${member.guild.name}`);
                return;
            }
            
            // Vérifier si un salon a été configuré
            if (!serverConfig.channelId) {
                console.error(`❌ Erreur: Aucun salon configuré pour les messages de bienvenue sur ${member.guild.name}`);
                return;
            }
            
            // Récupérer le salon de bienvenue
            console.log(`🔍 Recherche du salon: ${serverConfig.channelId}`);
            const welcomeChannel = member.guild.channels.cache.get(serverConfig.channelId);
            
            if (!welcomeChannel) {
                console.error(`❌ Erreur: Salon de bienvenue introuvable (ID: ${serverConfig.channelId}) pour ${member.guild.name}`);
                
                // Option: Désactiver automatiquement les messages de bienvenue si le salon n'existe plus
                serverConfig.enabled = false;
                welcomeConfig.set(member.guild.id, serverConfig);
                client.welcomeConfig = welcomeConfig;
                console.log(`⚠️ Messages de bienvenue désactivés pour ${member.guild.name} car le salon n'existe plus`);
                return;
            }
            
            // Vérifier les permissions dans le salon
            const permissions = welcomeChannel.permissionsFor(member.guild.members.me);
            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                console.error(`❌ Erreur: Permissions insuffisantes dans #${welcomeChannel.name} pour ${member.guild.name}`);
                return;
            }
            
            console.log(`📨 Tentative d'envoi du message de bienvenue pour ${member.user.tag} dans #${welcomeChannel.name}`);
            
            // Tentative d'envoi avec jusqu'à 3 essais
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;
            
            while (!success && attempts < maxAttempts) {
                attempts++;
                console.log(`🔄 Tentative ${attempts}/${maxAttempts} d'envoi du message de bienvenue`);
                
                try {
                    await sendWelcomeMessage(member, welcomeChannel, serverConfig);
                    success = true;
                    console.log(`✅ Message de bienvenue envoyé pour ${member.user.tag} dans #${welcomeChannel.name} (tentative ${attempts})`);
                } catch (err) {
                    console.error(`❌ Échec de la tentative ${attempts}: ${err.message}`);
                    
                    // Attendre avant de réessayer
                    if (attempts < maxAttempts) {
                        console.log(`⏱️ Attente de 1 seconde avant la prochaine tentative...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
            if (!success) {
                console.error(`❌ Impossible d'envoyer le message de bienvenue après ${maxAttempts} tentatives`);
            } else {
                // Notifications supplémentaires en cas de succès
                try {
                    if (member.guild.systemChannel && !member.user.bot) {
                        await member.guild.systemChannel.send({
                            content: `Les messages de bienvenue sont activés! Un message a été envoyé dans <#${welcomeChannel.id}> pour accueillir ${member.user.tag}.`,
                            allowedMentions: { parse: [] }  // Éviter les mentions
                        }).catch(() => {}); // Ignorer les erreurs ici
                    }
                } catch (notifError) {
                    console.error(`❌ Erreur lors de l'envoi de la notification: ${notifError.message}`);
                }
            }
            
        } catch (error) {
            console.error(`❌ Erreur lors du traitement de l'événement guildMemberAdd:`, error);
            
            // Essayer d'envoyer une notification d'erreur aux développeurs
            try {
                const errorGuild = client.guilds.cache.first();
                if (errorGuild && errorGuild.systemChannel) {
                    errorGuild.systemChannel.send({
                        content: `⚠️ **Erreur de système de bienvenue**: Une erreur est survenue lors du traitement d'un nouvel arrivant. Vérifiez les logs du bot.`,
                        allowedMentions: { parse: [] }
                    }).catch(() => {});
                }
            } catch (e) {
                console.error(`❌ Impossible d'envoyer la notification d'erreur:`, e);
            }
        }
    },
};
