const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, Partials } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
dotenv.config();

// Configuration et validation des variables d'environnement
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('❗| Assurez-vous que TOKEN et CLIENT_ID sont définis dans votre fichier .env');
    process.exit(1);
} else {
    console.log('✅ | Token et Client ID trouvés !');
}

// Initialisation du client avec les intents nécessaires pour un bot public
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ],
    presence: {
        activities: [{ name: 'les serveurs', type: ActivityType.Watching }],
        status: 'online',
    },
    shards: 'auto', // Permet le sharding automatique si nécessaire
});

// Collections pour stocker les commandes
const commands = new Collection();
const commandsArray = [];

/**
 * Fonction récursive pour charger les commandes depuis les dossiers
 * @param {string} dir - Le chemin du dossier à explorer
 */
function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.isFile() && file.name.endsWith('.js')) {
            try {
                const command = require(path.resolve(fullPath));
                
                // Validation de la structure de la commande
                if (!command.data || !command.data.name || !command.data.toJSON) {
                    console.warn(`⚠️ | Le fichier ${fullPath} ne contient pas une commande valide et a été ignoré.`);
                    continue;
                }
                
                // Enregistrement de la commande
                commands.set(command.data.name, command);
                commandsArray.push(command.data.toJSON());
                console.log(`✅ | Commande chargée : ${command.data.name} - ${command.data.description || 'Aucune description'}`);
            } catch (error) {
                console.error(`❌ | Une erreur est survenue lors du chargement de la commande ${fullPath} :`, error);
            }
        }
    }
}

/**
 * Fonction récursive pour charger les événements depuis les dossiers
 * @param {string} dir - Le chemin du dossier à explorer
 */
function loadEvents(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            loadEvents(fullPath);
        } else if (file.isFile() && file.name.endsWith('.js')) {
            try {
                const event = require(path.resolve(fullPath));
                
                // Validation de la structure de l'événement
                if (!event.name || !event.execute) {
                    console.warn(`⚠️ | Le fichier ${fullPath} ne contient pas un événement valide et a été ignoré.`);
                    continue;
                }
                
                // Enregistrement de l'événement
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
                console.log(`✅ | Événement chargé : ${event.name}`);
            } catch (error) {
                console.error(`❌ | Une erreur est survenue lors du chargement de l'événement ${fullPath} :`, error);
            }
        }
    }
}

// Chargement des commandes et des événements
(async () => {
    try {
        console.log('🔄 | Chargement des commandes...');
        loadCommands('./commands');
        console.log(`✅ | ${commandsArray.length} commande(s) chargée(s) avec succès.`);
        
        console.log('🔄 | Chargement des événements...');
        loadEvents('./events');
        console.log('✅ | Tous les événements ont été chargés.');
        
        // Enregistrement des commandes globalement pour tous les serveurs
        console.log(`🔄 | Début de l'enregistrement des commandes globales...`);
        await registerCommands();
        
        // Mettre en place la surveillance des fichiers pour le rechargement automatique
        setupAutoReload();
    } catch (error) {
        console.error('❌ | Une erreur est survenue lors de l\'initialisation :', error);
        process.exit(1);
    }
})();

/**
 * Fonction pour enregistrer les commandes sur Discord
 */
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const result = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsArray },
        );
        console.log(`✅ | ${result.length} commande(s) enregistrée(s) globalement avec succès !`);
        
        // Affichage des commandes enregistrées
        result.forEach(cmd => {
            console.log(`   - ${cmd.name}: ${cmd.description || 'Aucune description'}`);
        });
        
        return result;
    } catch (error) {
        console.error('❌ | Erreur lors de l\'enregistrement des commandes :', error);
        throw error;
    }
}

/**
 * Met en place le système de rechargement automatique des commandes
 */
function setupAutoReload() {
    const commandsPath = path.resolve('./commands');
    
    console.log('👁️ | Surveillance des fichiers de commandes activée. Les modifications seront automatiquement appliquées.');
    
    // Initialiser le watcher pour les fichiers de commandes
    const watcher = chokidar.watch(commandsPath, {
        ignored: /(^|[\/\\])\../, // Ignorer les fichiers cachés
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100
        }
    });

    // Gérer les événements de modification des fichiers
    watcher.on('change', async (filePath) => {
        if (path.extname(filePath) === '.js') {
            console.log(`📝 | Fichier modifié détecté: ${filePath}`);
            await reloadCommand(filePath);
        }
    });
    
    watcher.on('add', async (filePath) => {
        if (path.extname(filePath) === '.js') {
            console.log(`✨ | Nouveau fichier détecté: ${filePath}`);
            await reloadCommand(filePath);
        }
    });
    
    watcher.on('unlink', async (filePath) => {
        if (path.extname(filePath) === '.js') {
            console.log(`🗑️ | Fichier supprimé détecté: ${filePath}`);
            await reloadCommands();
        }
    });
    
    // Prévoir un rechargement périodique pour synchroniser les commandes
    // C'est utile pour s'assurer que les commandes sont toujours à jour même si le watcher rate des changements
    setInterval(async () => {
        await reloadCommands(true);
    }, 3600000); // Toutes les heures
}

/**
 * Recharge toutes les commandes
 * @param {boolean} silent - Si vrai, ne pas afficher de message si aucun changement n'est détecté
 */
async function reloadCommands(silent = false) {
    try {
        // Vider les collections existantes
        commands.clear();
        commandsArray.length = 0;
        
        // Vider le cache des modules pour être sûr de charger les dernières versions
        Object.keys(require.cache).forEach(key => {
            if (key.includes('commands')) {
                delete require.cache[key];
            }
        });
        
        // Recharger toutes les commandes
        loadCommands('./commands');
        
        // Enregistrer les commandes mises à jour
        console.log(`🔄 | Rechargement de ${commandsArray.length} commande(s)...`);
        await registerCommands();
        console.log('✅ | Commandes synchronisées avec succès !');
        
        return true;
    } catch (error) {
        console.error('❌ | Erreur lors du rechargement des commandes :', error);
        return false;
    }
}

/**
 * Recharge une commande spécifique
 * @param {string} filePath - Le chemin du fichier de la commande
 */
async function reloadCommand(filePath) {
    try {
        // Obtenir le nom de la commande à partir du chemin du fichier
        const relativePath = path.relative(process.cwd(), filePath);
        console.log(`🔄 | Tentative de rechargement de la commande: ${relativePath}`);
        
        // Supprimer du cache pour forcer le rechargement
        delete require.cache[require.resolve(path.resolve(filePath))];
        
        // Recharger toutes les commandes (plus simple que de gérer les dépendances individuelles)
        await reloadCommands();
        
        return true;
    } catch (error) {
        console.error(`❌ | Erreur lors du rechargement de la commande ${filePath} :`, error);
        return false;
    }
}

// Événements du client
client.once('ready', async () => {
    console.log(`✅ | Bot connecté en tant que ${client.user.tag} !`);
    console.log(`🌐 | Le bot est présent sur ${client.guilds.cache.size} serveurs`);
    
    // Mise à jour périodique du statut avec le nombre de serveurs
    function updateStatus() {
        const serverCount = client.guilds.cache.size;
        client.user.setActivity(`${serverCount} serveur${serverCount > 1 ? 's' : ''}`, { type: ActivityType.Watching });
    }
    
    // Mise à jour initiale puis toutes les 30 minutes
    updateStatus();
    setInterval(updateStatus, 30 * 60 * 1000);
    
    // Log des serveurs où le bot est présent
    console.log('📋 | Liste des serveurs :');
    client.guilds.cache.forEach(guild => {
        console.log(`   - ${guild.name} (${guild.id}) : ${guild.memberCount} membres`);
    });
});

// Événement lorsque le bot rejoint un nouveau serveur
client.on('guildCreate', guild => {
    console.log(`✅ | Bot ajouté au serveur : ${guild.name} (${guild.id}) - ${guild.memberCount} membres`);
    
    // Notification pour un salon système dans votre serveur principal si souhaité
    // const systemChannel = client.channels.cache.get('YOUR_LOGS_CHANNEL_ID');
    // if (systemChannel) systemChannel.send(`Bot ajouté à un nouveau serveur: ${guild.name} (${guild.memberCount} membres)`);
});

// Événement lorsque le bot est retiré d'un serveur
client.on('guildDelete', guild => {
    console.log(`❌ | Bot retiré du serveur : ${guild.name} (${guild.id})`);
});

// Gestion des interactions
client.on('interactionCreate', async interaction => {
    // Ignorer les interactions qui ne sont pas des commandes
    if (!interaction.isCommand()) return;
    
    // Récupérer la commande
    const command = commands.get(interaction.commandName);
    if (!command) return;

    // Logging des commandes utilisées pour les statistiques et le débogage
    console.log(`📝 | Commande ${interaction.commandName} utilisée par ${interaction.user.tag} dans ${interaction.guild.name}`);
    
    // Exécuter la commande
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ | Erreur lors de l'exécution de la commande ${interaction.commandName} :`, error);
        
        // Répondre à l'utilisateur
        const replyContent = {
            content: 'Une erreur est survenue lors de l\'exécution de cette commande.',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(replyContent).catch(console.error);
        } else {
            await interaction.reply(replyContent).catch(console.error);
        }
    }
});

// Gestionnaire pour les interactions avec le système de tickets
client.on('interactionCreate', async interaction => {
    // Pour le menu de sélection de catégorie de ticket
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
        const ticketSystem = require('./commands/ticketSystem');
        await ticketSystem.handleTicketCreation(interaction);
    }
    
    // Pour les boutons de ticket
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        const ticketSystem = require('./commands/ticketSystem');
        
        if (interaction.customId === 'ticket_close') {
            await ticketSystem.handleTicketClose(interaction);
        }
        else if (interaction.customId === 'ticket_claim') {
            await ticketSystem.handleTicketClaim(interaction);
        }
        else if (interaction.customId === 'ticket_transcript') {
            await ticketSystem.handleTicketTranscript(interaction);
        }
    }
    
    // Pour les modals de ticket
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_')) {
        const ticketSystem = require('./commands/ticketSystem');
        
        if (interaction.customId.startsWith('ticket_modal_')) {
            await ticketSystem.createTicket(interaction);
        }
        else if (interaction.customId === 'ticket_close_modal' || interaction.customId === 'ticket_delete_modal') {
            await ticketSystem.handleTicketCloseSubmit(interaction);
        }
    }
});

// Système de récupération automatique en cas de déconnexion
client.on('disconnect', (event) => {
    console.log(`🔌 | Bot déconnecté de Discord avec le code ${event.code}. Tentative de reconnexion...`);
});

client.on('reconnecting', () => {
    console.log('🔄 | Tentative de reconnexion à Discord...');
});

client.on('resume', (replayed) => {
    console.log(`✅ | Reconnexion réussie ! ${replayed} événements ont été rejoués.`);
});

client.on('error', error => {
    console.error('❌ | Une erreur s\'est produite avec la connexion Discord :', error);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (error) => {
    console.error('❌ | Erreur non gérée :', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ | Exception non capturée :', error);
    
    // Enregistrement de l'erreur sans quitter pour un bot public
    // Dans un environnement de production, vous pourriez vouloir implémenter
    // un système de redémarrage automatique externe
});

// Gestion propre de l'arrêt du bot
process.on('SIGINT', () => {
    console.log('📴 | Arrêt du bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('📴 | Arrêt du bot...');
    client.destroy();
    process.exit(0);
});

// Connexion du bot à Discord avec gestion des erreurs
client.login(TOKEN)
    .then(() => console.log('🔗 | Connexion à Discord établie'))
    .catch(error => {
        console.error('❌ | Impossible de se connecter à Discord :', error);
        process.exit(1);
    });