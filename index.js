// ==================== IMPORTS ====================
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const sodium = require('libsodium-wrappers'); // Für Discord Voice Encryption

// ==================== EINSTELLUNGEN ====================
const WAITING_ROOM_ID = '1458120351476355297';
const SUPPORT_CATEGORY_ID = '1453106098423988336';
const SUPPORT_ROLE_ID = '1458579996707782823';
const AUDIO_URL = 'https://files.catbox.moe/hlur31.mp3';
// ======================================================

// ==================== BOT INITIALISIEREN ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

let connection;
let player = createAudioPlayer();

// ==================== WARTEMUSIK-FUNKTION ====================
async function playLoop(channel) {
  const ffmpeg = spawn('ffmpeg', [
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

  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });
  player.play(resource);

  player.once(AudioPlayerStatus.Idle, () => playLoop(channel));
}

// ==================== FUNKTIONEN ====================
async function startBot() {
  // libsodium warten, damit Discord Voice verschlüsselung funktioniert
  await sodium.ready;
  console.log('✅ Libsodium ist bereit, Voice sollte funktionieren.');

  // Token von Railway
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error("❌ Kein Bot-Token gefunden! Bitte Umgebungsvariable prüfen.");
    process.exit(1);
  }

  // Login
  await client.login(BOT_TOKEN);
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
    playLoop(channel);
    console.log("🎵 Wartemusik gestartet");
  } catch (err) {
    console.error("❌ Verbindung zum Wartekanal fehlgeschlagen:", err);
  }
});

// ==================== VOICE STATE UPDATE ====================
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!newState.channelId || newState.channelId !== WAITING_ROOM_ID) return;
  if (newState.member.user.bot) return;

  const guild = newState.guild;

  // Neuen Support-Voice-Channel erstellen
  const supportChannel = await guild.channels.create({
    name: `support-${newState.member.user.username}`,
    type: ChannelType.GuildVoice,
    parent: SUPPORT_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ['Connect'] },
      { id: newState.member.id, allow: ['Connect', 'Speak'] }
    ]
  });

  await newState.setChannel(supportChannel);

  // Support-Log Text-Channel
  const textChannel = guild.channels.cache.find(c => c.name === "support-log");
  if (textChannel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${supportChannel.id}`)
        .setLabel('Übernehmen')
        .setStyle(ButtonStyle.Success)
    );

    textChannel.send({
      content: `<@&${1458579996707782823}> 🔔 Neuer Supportfall von **${newState.member.user.tag}**`,
      components: [row]
    });
  }
});

// ==================== BUTTON INTERACTION ====================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('claim_')) return;

  const channelId = interaction.customId.split('_')[1];
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return;

  await channel.permissionOverwrites.edit(interaction.user.id, {
    Connect: true,
    Speak: true
  });

  await interaction.reply({ content: `Du hast den Support übernommen!`, ephemeral: true });
});

// ==================== BOT START ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ Kein Bot-Token gefunden!");
  process.exit(1);
}

(async () => {
  await sodium.ready; // Warten, bis libsodium bereit ist
  console.log('✅ Libsodium ist bereit, Voice sollte funktionieren.');
  await client.login(BOT_TOKEN);
})();
