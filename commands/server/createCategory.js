const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-category')
        .setDescription('✨ Créer une nouvelle catégorie sur le serveur 🗂️')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('🏷️ Nom de la catégorie à créer')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('🎨 Couleur de l\'embed (format hex: #RRGGBB)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('😊 Emoji à ajouter au nom de la catégorie')
                .setRequired(false)),
    
    async execute(interaction) {
        const guild = interaction.guild;
        let categoryName = interaction.options.getString('name');
        const categoryColor = interaction.options.getString('color') || '#5865F2'; // Couleur Discord par défaut
        const categoryEmoji = interaction.options.getString('emoji');

        // Ajout de l'emoji au nom si fourni
        if (categoryEmoji) {
            categoryName = `${categoryEmoji} ${categoryName}`;
        }

        // Vérification des permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ 
                content: '⛔ Oups ! Vous n\'avez pas la permission de créer une catégorie.', 
                ephemeral: true 
            });
        }

        // Création de la catégorie avec animation de chargement
        await interaction.deferReply();

        try {
            const category = await guild.channels.create({
                name: categoryName,
                type: 4, // Type for category
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: ['ViewChannel'],
                    },
                ],
            });

            // Création d'un message embed plus attrayant
            const embed = new EmbedBuilder()
                .setColor(categoryColor)
                .setTitle(`🎉 Catégorie créée avec succès !`)
                .setDescription(`**Nom:** ${categoryName}\n**ID:** ${category.id}`)
                .addFields(
                    { name: '👤 Créateur', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Créée le', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: '✅ Utilisez la commande /create-salon pour ajouter des salons !' })
                .setTimestamp();

            await interaction.editReply({ 
                content: `✅ La catégorie ${categoryName} a été créée !`,
                embeds: [embed] 
            });
        } catch (error) {
            console.error(error);
            return interaction.editReply({ 
                content: '❌ Oups ! Une erreur est survenue lors de la création de la catégorie. Vérifiez les permissions du bot ou réessayez plus tard.', 
                ephemeral: true 
            });
        }
    }
}