const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');

const TOKEN = process.env.TOKEN;

// ===== EINSTELLUNGEN =====
const WAITING_ROOM_ID = '1458120351476355297';
const SUPPORT_CATEGORY_ID = '1453106098423988336';
const SUPPORT_ROLE_ID = '1458579996707782823';
const AUDIO_URL = 'https://files.catbox.moe/hlur31.mp3';
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

let connection;
let player = createAudioPlayer();

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

client.once('ready', async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(WAITING_ROOM_ID);

  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false
  });

  connection.subscribe(player);

  await entersState(connection, VoiceConnectionStatus.Ready, 30000);
  playLoop(channel);

  console.log("🎵 Wartemusik gestartet");
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!newState.channelId || newState.channelId !== WAITING_ROOM_ID) return;
  if (newState.member.user.bot) return;

  const guild = newState.guild;

  const supportChannel = await guild.channels.create({
    name: `support-${newState.member.user.username}`,
    type: ChannelType.GuildVoice,
    parent: SUPPORT_CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: ['Connect']
      },
      {
        id: newState.member.id,
        allow: ['Connect', 'Speak']
      }
    ]
  });

  await newState.setChannel(supportChannel);

  const textChannel = guild.channels.cache.find(c => c.name === "support-log");

  if (textChannel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${supportChannel.id}`)
        .setLabel('Übernehmen')
        .setStyle(ButtonStyle.Success)
    );

    textChannel.send({
      content: `<@&${SUPPORT_ROLE_ID}> 🔔 Neuer Supportfall von **${newState.member.user.tag}**`,
      components: [row]
    });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('claim_')) return;

  const channelId = interaction.customId.split('_')[1];
  const channel = interaction.guild.channels.cache.get(channelId);

  await channel.permissionOverwrites.edit(interaction.user.id, {
    Connect: true,
    Speak: true
  });

  await interaction.reply({ content: `Du hast den Support übernommen!`, ephemeral: true });
});

client.login(BOT_TOKEN);

