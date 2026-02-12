// ==================== IMPORTS ====================
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const sodium = require('libsodium-wrappers');
const ffmpegPath = require('ffmpeg-static'); // garantiert auf Railway verfügbar

// ==================== EINSTELLUNGEN ====================
const WAITING_ROOM_ID = '1458120351476355297'; // Dein Wartekanal
const AUDIO_URL = 'https://files.catbox.moe/hlur31.mp3'; // MP3 URL
// ======================================================

// ==================== CLIENT ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

let connection;
let player = createAudioPlayer();

// ==================== WARTEMUSIK ====================
async function playLoop() {
  const ffmpeg = spawn(ffmpegPath, [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', AUDIO_URL,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ]);

  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Arbitrary });
  player.play(resource);

  player.once(AudioPlayerStatus.Idle, () => playLoop());
}

// ==================== READY EVENT ====================
client.once('ready', async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(WAITING_ROOM_ID);
  if (!channel) {
    console.error("❌ Wartekanal nicht gefunden! Überprüfe WAITING_ROOM_ID.");
    return;
  }

  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false
  });

  connection.subscribe(player);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30000);
    console.log("🎵 Wartemusik gestartet");
    playLoop();
  } catch (err) {
    console.error("❌ Verbindung zum Wartekanal fehlgeschlagen:", err);
  }
});

// ==================== BOT START ====================
(async () => {
  await sodium.ready;
  console.log('✅ Libsodium bereit, Voice sollte funktionieren.');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error("❌ Kein Bot-Token gefunden! Bitte Umgebungsvariable prüfen.");
    process.exit(1);
  }

  await client.login(BOT_TOKEN);
})();
