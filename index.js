const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

const activeCases = new Map();
let connection = null;
let player = null;

function startMusic(channel) {
    if (connection) return;

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
    });

    player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });

    connection.subscribe(player);

    const playLoop = () => {
        const resource = createAudioResource(path.join(__dirname, "support.mp3"));
        player.play(resource);
    };

    player.on(AudioPlayerStatus.Idle, playLoop);
    playLoop();
}

function stopMusic() {
    if (!connection) return;
    connection.destroy();
    connection = null;
}

client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!newState.channelId || newState.channelId !== config.waitRoom) return;
    if (newState.member.user.bot) return;

    const channel = newState.channel;
    startMusic(channel);

    const text = await client.channels.fetch(config.textChannel);

    const embed = new EmbedBuilder()
        .setTitle("🆘 Neuer Supportfall")
        .setDescription(`User: <@${newState.member.id}>\nStatus: Wartet auf Support`)
        .setColor("Yellow");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`take_${newState.member.id}`)
            .setLabel("Supportfall übernehmen")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`close_${newState.member.id}`)
            .setLabel("Supportfall beenden")
            .setStyle(ButtonStyle.Danger)
    );

    const msg = await text.send({ embeds: [embed], components: [row] });
    activeCases.set(newState.member.id, { message: msg });
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, userId] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(config.supportRole))
        return interaction.reply({ content: "Keine Berechtigung.", ephemeral: true });

    const target = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!target) return interaction.reply({ content: "User nicht mehr da.", ephemeral: true });

    if (action === "take") {
        if (!member.voice.channel)
            return interaction.reply({ content: "Du bist in keinem Voicechannel.", ephemeral: true });

        await target.voice.setChannel(member.voice.channel);

        const embed = new EmbedBuilder()
            .setTitle("🟢 In Bearbeitung")
            .setDescription(`Supporter: <@${member.id}>\nUser: <@${target.id}>`)
            .setColor("Green");

        await interaction.update({ embeds: [embed], components: [] });
    }

    if (action === "close") {
        const embed = new EmbedBuilder()
            .setTitle("✅ Abgeschlossen")
            .setDescription(`Geschlossen von <@${member.id}>`)
            .setColor("Grey");

        await interaction.update({ embeds: [embed], components: [] });
    }
});

client.on("voiceStateUpdate", (oldState, newState) => {
    const channel = oldState.guild.channels.cache.get(config.waitRoom);
    if (!channel) return;

    if (channel.members.filter(m => !m.user.bot).size === 0)
        stopMusic();
});

client.login(process.env.BOT_TOKEN);

