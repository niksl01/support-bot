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
    VoiceConnectionStatus,
    StreamType
} = require('@discordjs/voice');

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

let connection = null;
let player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
});


// ===== MUSIC LOOP =====
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

    connection.subscribe(player);

    const file = path.join(__dirname, "support.mp3");

    const play = () => {
        if (!fs.existsSync(file)) {
            console.log("MP3 fehlt");
            return;
        }

        const stream = fs.createReadStream(file);

        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        resource.volume.setVolume(0.25);

        player.play(resource);
    };

    play();

    player.on(AudioPlayerStatus.Idle, play);

    player.on("error", err => {
        console.log("Player Error:", err.message);
    });
}


// ===== STOP MUSIC =====
function stopMusic() {
    if (!connection) return;

    player.stop(true);
    connection.destroy();
    connection = null;
    console.log("Voice getrennt");
}


// ===== WAITING ROOM =====
client.on("voiceStateUpdate", async (oldState, newState) => {

    const waitRoom = newState.guild.channels.cache.get(config.waitRoom);
    if (!waitRoom) return;

    // join
    if (newState.channelId === config.waitRoom && !newState.member.user.bot)
        await startMusic(newState.channel);

    // leave -> leer
    if (waitRoom.members.filter(m => !m.user.bot).size === 0)
        stopMusic();
});


// ===== READY =====
client.once("clientReady", () => {
    console.log(`Bot online als ${client.user.tag}`);
});


// ===== LOGIN (Railway ENV) =====
client.login(process.env.BOT_TOKEN);
