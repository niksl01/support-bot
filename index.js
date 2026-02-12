const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const config = require('./config.json');


// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

let connection = null;
let player = null;


// ================= MUSIK START =================
async function startMusic(channel) {

    if (connection) return;

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20000);
        console.log("Voice verbunden");
    } catch {
        console.log("Voice konnte nicht verbinden");
        connection.destroy();
        connection = null;
        return;
    }

    player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });

    connection.subscribe(player);

    const file = path.join(__dirname, "support.mp3");

    if (!fs.existsSync(file)) {
        console.log("support.mp3 fehlt im Projekt!");
        return;
    }

    const play = () => {
        const resource = createAudioResource(file);
        player.play(resource);
    };

    player.on(AudioPlayerStatus.Idle, play);
    player.on('error', e => console.log("Audio Fehler:", e.message));

    play();
}


// ================= MUSIK STOP =================
function stopMusic(guild) {
    if (!connection) return;

    const channel = guild.channels.cache.get(config.waitRoom);
    if (!channel) return;

    const humans = channel.members.filter(m => !m.user.bot).size;

    if (humans === 0) {
        console.log("Niemand mehr im Warteraum → stoppe Musik");
        player.stop();
        connection.destroy();
        connection = null;
        player = null;
    }
}


// ================= VOICE EVENT =================
client.on("voiceStateUpdate", async (oldState, newState) => {

    const waitRoom = newState.guild.channels.cache.get(config.waitRoom);
    if (!waitRoom) return;

    // USER BETRITT WARTERAUM
    if (newState.channelId === config.waitRoom && !newState.member.user.bot) {

        await startMusic(waitRoom);

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

        await text.send({
            content: `<@&1458579996707782823>`, // Rollen Ping
            embeds: [embed],
            components: [row]
        });
    }

    // USER VERLÄSST WARTERAUM
    if (oldState.channelId === config.waitRoom) {
        stopMusic(oldState.guild);
    }
});


// ================= BUTTONS =================
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


// ================= READY =================
client.once("clientReady", () => {
    console.log(`Bot online als ${client.user.tag}`);
});


// ================= LOGIN (RAILWAY) =================
if (!process.env.BOT_TOKEN) {
    console.error("BOT_TOKEN fehlt in Railway Variablen!");
    process.exit(1);
}

client.login(process.env.BOT_TOKEN);

