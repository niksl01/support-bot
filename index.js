const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder 
} = require('discord.js');

const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior, 
    entersState, 
    VoiceConnectionStatus 
} = require('@discordjs/voice');

const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// === CLIENT SETUP ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// === GLOBALS ===
const activeCases = new Map();
let connection = null;
let player = null;

// === MUSIK STARTEN ===
async function startMusic(channel) {
    if (connection) return;

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    } catch (err) {
        console.error("Fehler beim Verbinden:", err);
        connection.destroy();
        connection = null;
        return;
    }

    player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    connection.subscribe(player);

    const filePath = path.join(__dirname, "support.mp3");
    if (!fs.existsSync(filePath)) {
        console.log("support.mp3 fehlt!");
        return;
    }

    const playAudio = () => {
        const resource = createAudioResource(filePath);
        player.play(resource);
    };

    player.on(AudioPlayerStatus.Idle, playAudio);
    player.on('error', e => console.error("AudioPlayer Fehler:", e.message));
    playAudio();
}

// === MUSIK STOPPEN ===
function stopMusic() {
    if (!connection) return;
    if (player) player.stop();
    connection.destroy();
    connection = null;
}

// === VOICESTATEUPDATE ===
client.on("voiceStateUpdate", async (oldState, newState) => {
    const waitRoom = newState.guild.channels.cache.get(config.waitRoom);
    if (!waitRoom) return;

    // Musik starten, wenn jemand in den Wartebereich kommt
    if (newState.channelId === config.waitRoom && !newState.member.user.bot) {
        await startMusic(newState.channel);
    }

    // Musik stoppen, wenn niemand mehr im Wartebereich
    if (waitRoom.members.filter(m => !m.user.bot).size === 0) {
        stopMusic();
    }

    // Supportfall erstellen
    if (!newState.channelId || newState.channelId !== config.waitRoom || newState.member.user.bot) return;

    const textChannel = await client.channels.fetch(config.textChannel);
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

    const msg = await textChannel.send({ embeds: [embed], components: [row] });
    activeCases.set(newState.member.id, { message: msg });
});

// === BUTTON INTERACTIONS ===
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, userId] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(config.supportRole)) {
        return interaction.reply({ content: "Keine Berechtigung.", ephemeral: true });
    }

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

// === READY EVENT ===
client.once("ready", () => {
    console.log(`Bot online als ${client.user.tag}`);
});

// === LOGIN MIT DIREKTEM TOKEN ===
const BOT_TOKEN = "MTQ3MTE4NDU2NTg3NDg1MTk2MQ.GU_baw.U0WAeOddQ2Ctk70kjrVx6Qy8zTcCtK8kW1-6XQ"; // <-- Token direkt hier eintragen
client.login(BOT_TOKEN).catch(err => {
    console.error("FEHLER: Token ungültig oder Discord konnte nicht verbinden:", err);
    process.exit(1);
});

});

