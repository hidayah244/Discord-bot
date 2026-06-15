// ============================================
// Discord Music Bot 24/7 (DisTube v5)
// Mendukung: YouTube, Spotify, SoundCloud
// ============================================
require("node:dns").setDefaultResultOrder("ipv4first");
require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require("discord.js");
const { DisTube } = require("distube");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");

// ============================================
// Konfigurasi
// ============================================
const PREFIX = process.env.PREFIX || "!";
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN tidak ditemukan di file .env!");
  console.error("   Salin .env.example menjadi .env dan isi token bot kamu.");
  process.exit(1);
}

// ============================================
// Inisialisasi Client Discord
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// ============================================
// Inisialisasi DisTube v5 (Music Engine)
// ============================================
const spotifyOptions = {};
if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  spotifyOptions.api = {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  };
}

const distube = new DisTube(client, {
  emitNewSongOnly: true,
  emitAddSongWhenCreatingQueue: false,
  emitAddListWhenCreatingQueue: false,
  plugins: [
    new YtDlpPlugin({ update: true }),
    new SpotifyPlugin(spotifyOptions),
    new SoundCloudPlugin(),
  ],
});

// ============================================
// Set untuk menyimpan channel 24/7
// Key: guildId, Value: voiceChannelId
// ============================================
const stayChannels = new Map();

// --- DEBUGGING EVENTS UNTUK DISTUBE ---
distube
  .on("playSong", (queue, song) => console.log(`🎵 Memutar: ${song.name}`))
  .on("addSong", (queue, song) => console.log(`➕ Ditambahkan: ${song.name}`))
  .on("error", (channel, e) => {
    console.error("❌ DISTUBE ERROR:", e);
    if (channel) channel.send(`❌ Terjadi error: \`${e.message.slice(0, 2000)}\``);
  })
  .on("empty", channel => console.log("⚠️ Voice channel kosong, bot akan keluar."))
  .on("disconnect", queue => console.log("👋 Disconnected dari voice channel."));


// ============================================
// Helper Functions
// ============================================

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "🔴 Live";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function createMusicEmbed(title, description, color = "#5865F2") {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: "🎵 Discord Music Bot 24/7" });
}

function getSourceEmoji(source) {
  const sources = {
    youtube: "🔴 YouTube",
    spotify: "🟢 Spotify",
    soundcloud: "🟠 SoundCloud",
  };
  return sources[source?.toLowerCase()] || "🎵 Unknown";
}

function createProgressBar(current, total, length = 15) {
  if (!total) return "▬".repeat(length);
  const progress = Math.round((current / total) * length);
  return "▓".repeat(progress) + "░".repeat(length - progress);
}

// ============================================
// Helper: Get queue safely (DisTube v5)
// ============================================
function getQueue(guildId) {
  return distube.getQueue(guildId);
}

// ============================================
// Command Handlers
// ============================================
const commands = {
  // --- PLAY ---
  play: {
    aliases: ["p", "putar"],
    description: "Putar musik dari YouTube/Spotify/SoundCloud",
    usage: `${PREFIX}play <judul/URL>`,
    async execute(message, args) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Kamu harus masuk ke voice channel dulu!", "#ED4245")],
        });
      }

      const query = args.join(" ");
      if (!query) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", `Masukkan judul atau URL lagu!\nContoh: \`${PREFIX}play Never Gonna Give You Up\``, "#ED4245")],
        });
      }

      try {
        await message.react("🔍");
        await distube.play(voiceChannel, query, {
          member: message.member,
          textChannel: message.channel,
          message,
        });
      } catch (error) {
        console.error("Play error:", error);
        message.reply({
          embeds: [createMusicEmbed("❌ Error", `Gagal memutar: ${error.message}`, "#ED4245")],
        });
      }
    },
  },

  // --- STOP ---
  stop: {
    aliases: ["s", "berhenti"],
    description: "Hentikan musik dan kosongkan antrian",
    usage: `${PREFIX}stop`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }
      await queue.stop();
      message.react("⏹️");
    },
  },

  // --- SKIP ---
  skip: {
    aliases: ["sk", "lewat", "next"],
    description: "Skip ke lagu selanjutnya",
    usage: `${PREFIX}skip`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }
      if (queue.songs.length <= 1) {
        return message.reply({
          embeds: [createMusicEmbed("⚠️ Info", "Tidak ada lagu selanjutnya di antrian!", "#FEE75C")],
        });
      }
      await queue.skip();
      message.react("⏭️");
    },
  },

  // --- PAUSE ---
  pause: {
    aliases: ["jeda"],
    description: "Pause musik",
    usage: `${PREFIX}pause`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }
      if (queue.paused) {
        return message.reply({
          embeds: [createMusicEmbed("⚠️ Info", "Musik sudah di-pause! Gunakan `!resume` untuk melanjutkan.", "#FEE75C")],
        });
      }
      queue.pause();
      message.react("⏸️");
    },
  },

  // --- RESUME ---
  resume: {
    aliases: ["lanjut", "unpause"],
    description: "Lanjutkan musik yang di-pause",
    usage: `${PREFIX}resume`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }
      if (!queue.paused) {
        return message.reply({
          embeds: [createMusicEmbed("⚠️ Info", "Musik tidak sedang di-pause!", "#FEE75C")],
        });
      }
      queue.resume();
      message.react("▶️");
    },
  },

  // --- VOLUME ---
  volume: {
    aliases: ["vol", "v"],
    description: "Atur volume (0-150)",
    usage: `${PREFIX}volume <angka>`,
    async execute(message, args) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }

      if (!args[0]) {
        return message.reply({
          embeds: [createMusicEmbed("🔊 Volume", `Volume saat ini: **${queue.volume}%**`, "#5865F2")],
        });
      }

      const vol = parseInt(args[0]);
      if (isNaN(vol) || vol < 0 || vol > 150) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Volume harus antara 0-150!", "#ED4245")],
        });
      }

      queue.setVolume(vol);
      message.reply({
        embeds: [createMusicEmbed("🔊 Volume", `Volume diubah ke **${vol}%**`, "#57F287")],
      });
    },
  },

  // --- QUEUE ---
  queue: {
    aliases: ["q", "antrian", "list"],
    description: "Lihat antrian musik",
    usage: `${PREFIX}queue`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Antrian kosong!", "#ED4245")],
        });
      }

      const current = queue.songs[0];
      let description = `**🎶 Sedang Diputar:**\n[${current.name}](${current.url}) - \`${formatDuration(current.duration)}\`\nDiminta oleh: ${current.user}\n\n`;

      if (queue.songs.length > 1) {
        description += "**📋 Antrian:**\n";
        const upcoming = queue.songs.slice(1, 11);
        upcoming.forEach((song, i) => {
          description += `**${i + 1}.** [${song.name}](${song.url}) - \`${formatDuration(song.duration)}\` | ${song.user}\n`;
        });
        if (queue.songs.length > 11) {
          description += `\n... dan **${queue.songs.length - 11}** lagu lainnya`;
        }
      }

      description += `\n\n🔁 Loop: **${queue.repeatMode === 0 ? "Off" : queue.repeatMode === 1 ? "Lagu" : "Antrian"}** | 🔊 Volume: **${queue.volume}%**`;

      message.reply({
        embeds: [createMusicEmbed("📋 Antrian Musik", description)],
      });
    },
  },

  // --- NOW PLAYING ---
  nowplaying: {
    aliases: ["np", "now", "playing", "lagi"],
    description: "Lihat lagu yang sedang diputar",
    usage: `${PREFIX}nowplaying`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }

      const song = queue.songs[0];
      const current = queue.currentTime;
      const total = song.duration;
      const progress = createProgressBar(current, total);

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🎵 Sedang Diputar")
        .setDescription(`**[${song.name}](${song.url})**`)
        .setThumbnail(song.thumbnail || null)
        .addFields(
          { name: "⏱️ Durasi", value: `\`${formatDuration(current)} ${progress} ${formatDuration(total)}\``, inline: false },
          { name: "👤 Diminta oleh", value: `${song.user}`, inline: true },
          { name: "📡 Sumber", value: getSourceEmoji(song.source), inline: true },
          { name: "🔊 Volume", value: `${queue.volume}%`, inline: true },
          { name: "👁️ Views", value: song.views ? song.views.toLocaleString() : "N/A", inline: true },
          { name: "👍 Likes", value: song.likes ? song.likes.toLocaleString() : "N/A", inline: true },
          { name: "🔁 Loop", value: queue.repeatMode === 0 ? "Off" : queue.repeatMode === 1 ? "Lagu" : "Antrian", inline: true },
        )
        .setTimestamp()
        .setFooter({ text: "🎵 Discord Music Bot 24/7" });

      // Tombol kontrol
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("music_pause").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("music_skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("music_stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("music_loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("music_shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
      );

      message.reply({ embeds: [embed], components: [row] });
    },
  },

  // --- LOOP ---
  loop: {
    aliases: ["repeat", "ulangi"],
    description: "Atur mode loop (off/song/queue)",
    usage: `${PREFIX}loop [off/song/queue]`,
    async execute(message, args) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }

      let mode;
      const arg = args[0]?.toLowerCase();
      if (!arg) {
        // Cycle: off -> song -> queue -> off
        mode = (queue.repeatMode + 1) % 3;
      } else if (["off", "0", "mati"].includes(arg)) {
        mode = 0;
      } else if (["song", "1", "lagu", "track"].includes(arg)) {
        mode = 1;
      } else if (["queue", "2", "antrian", "all", "semua"].includes(arg)) {
        mode = 2;
      } else {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", `Mode tidak valid! Gunakan: \`off\`, \`song\`, atau \`queue\``, "#ED4245")],
        });
      }

      queue.setRepeatMode(mode);
      const modeText = ["⏹️ Off - Tidak diulang", "🔂 Song - Ulangi lagu ini", "🔁 Queue - Ulangi seluruh antrian"];
      message.reply({
        embeds: [createMusicEmbed("🔁 Loop Mode", `Mode loop diubah ke: **${modeText[mode]}**`, "#57F287")],
      });
    },
  },

  // --- SHUFFLE ---
  shuffle: {
    aliases: ["acak", "random"],
    description: "Acak urutan antrian",
    usage: `${PREFIX}shuffle`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }
      await queue.shuffle();
      message.react("🔀");
      message.reply({
        embeds: [createMusicEmbed("🔀 Shuffle", "Antrian telah diacak!", "#57F287")],
      });
    },
  },

  // --- JOIN ---
  join: {
    aliases: ["masuk", "connect"],
    description: "Bot masuk ke voice channel kamu",
    usage: `${PREFIX}join`,
    async execute(message) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Kamu harus masuk ke voice channel dulu!", "#ED4245")],
        });
      }

      try {
        await distube.voices.join(voiceChannel);
        message.reply({
          embeds: [createMusicEmbed("✅ Terhubung", `Bot telah masuk ke **${voiceChannel.name}**`, "#57F287")],
        });
      } catch (error) {
        message.reply({
          embeds: [createMusicEmbed("❌ Error", `Gagal masuk: ${error.message}`, "#ED4245")],
        });
      }
    },
  },

  // --- LEAVE ---
  leave: {
    aliases: ["keluar", "disconnect", "dc"],
    description: "Bot keluar dari voice channel",
    usage: `${PREFIX}leave`,
    async execute(message) {
      const voice = distube.voices.get(message.guildId);
      if (!voice) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Bot tidak sedang di voice channel!", "#ED4245")],
        });
      }

      // Hapus dari daftar 24/7
      stayChannels.delete(message.guildId);

      distube.voices.leave(message.guildId);
      message.reply({
        embeds: [createMusicEmbed("👋 Keluar", "Bot telah keluar dari voice channel.", "#FEE75C")],
      });
    },
  },

  // --- 24/7 STAY ---
  stay: {
    aliases: ["247", "24/7", "tetap"],
    description: "Toggle mode 24/7 - bot tetap di voice channel",
    usage: `${PREFIX}stay`,
    async execute(message) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Kamu harus masuk ke voice channel dulu!", "#ED4245")],
        });
      }

      if (stayChannels.has(message.guildId)) {
        stayChannels.delete(message.guildId);
        message.reply({
          embeds: [createMusicEmbed("🌙 24/7 Mode", "Mode 24/7 **DIMATIKAN**. Bot akan keluar saat tidak ada yang mendengarkan.", "#FEE75C")],
        });
      } else {
        stayChannels.set(message.guildId, voiceChannel.id);

        // Pastikan bot ada di channel
        try {
          await distube.voices.join(voiceChannel);
        } catch (e) {
          // Ignore jika sudah terhubung
        }

        message.reply({
          embeds: [createMusicEmbed("🌟 24/7 Mode", `Mode 24/7 **AKTIF**!\nBot akan tetap di **${voiceChannel.name}** meskipun tidak ada yang mendengarkan.`, "#57F287")],
        });
      }
    },
  },

  // --- SEEK ---
  seek: {
    aliases: ["loncat"],
    description: "Loncat ke waktu tertentu dalam lagu",
    usage: `${PREFIX}seek <detik>`,
    async execute(message, args) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }

      const time = parseInt(args[0]);
      if (isNaN(time) || time < 0) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Masukkan waktu dalam detik yang valid!", "#ED4245")],
        });
      }

      await queue.seek(time);
      message.reply({
        embeds: [createMusicEmbed("⏩ Seek", `Meloncat ke **${formatDuration(time)}**`, "#57F287")],
      });
    },
  },

  // --- REMOVE ---
  remove: {
    aliases: ["hapus", "rm"],
    description: "Hapus lagu dari antrian berdasarkan nomor",
    usage: `${PREFIX}remove <nomor>`,
    async execute(message, args) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }

      const num = parseInt(args[0]);
      if (isNaN(num) || num < 1 || num >= queue.songs.length) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", `Nomor tidak valid! Masukkan antara 1-${queue.songs.length - 1}`, "#ED4245")],
        });
      }

      const removed = queue.songs.splice(num, 1)[0];
      message.reply({
        embeds: [createMusicEmbed("🗑️ Dihapus", `Menghapus **${removed.name}** dari antrian.`, "#FEE75C")],
      });
    },
  },

  // --- AUTOPLAY ---
  autoplay: {
    aliases: ["ap", "auto"],
    description: "Toggle autoplay - otomatis putar lagu mirip",
    usage: `${PREFIX}autoplay`,
    async execute(message) {
      const queue = getQueue(message.guildId);
      if (!queue) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Tidak ada musik yang sedang diputar!", "#ED4245")],
        });
      }

      const mode = queue.toggleAutoplay();
      message.reply({
        embeds: [createMusicEmbed(
          "🤖 Autoplay",
          `Autoplay sekarang: **${mode ? "AKTIF ✅" : "MATI ❌"}**\n${mode ? "Bot akan otomatis memutar lagu yang mirip setelah antrian habis." : ""}`,
          mode ? "#57F287" : "#FEE75C",
        )],
      });
    },
  },

  // --- SEARCH ---
  search: {
    aliases: ["cari", "find"],
    description: "Cari lagu dan pilih dari daftar",
    usage: `${PREFIX}search <judul>`,
    async execute(message, args) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Kamu harus masuk ke voice channel dulu!", "#ED4245")],
        });
      }

      const query = args.join(" ");
      if (!query) {
        return message.reply({
          embeds: [createMusicEmbed("❌ Error", "Masukkan kata kunci pencarian!", "#ED4245")],
        });
      }

      try {
        const results = await distube.search(query, { limit: 10 });
        if (!results.length) {
          return message.reply({
            embeds: [createMusicEmbed("❌ Error", "Tidak ditemukan hasil!", "#ED4245")],
          });
        }

        let description = results.map((r, i) =>
          `**${i + 1}.** [${r.name}](${r.url}) - \`${formatDuration(r.duration)}\``
        ).join("\n");

        description += `\n\n💬 Ketik **nomor (1-${results.length})** untuk memilih, atau **cancel** untuk membatalkan.`;

        const searchMsg = await message.reply({
          embeds: [createMusicEmbed("🔍 Hasil Pencarian", description)],
        });

        const filter = (m) => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, max: 1, time: 30000 });

        collector.on("collect", async (m) => {
          if (m.content.toLowerCase() === "cancel") {
            return searchMsg.edit({ embeds: [createMusicEmbed("❌ Dibatalkan", "Pencarian dibatalkan.", "#FEE75C")] });
          }

          const choice = parseInt(m.content);
          if (isNaN(choice) || choice < 1 || choice > results.length) {
            return searchMsg.edit({ embeds: [createMusicEmbed("❌ Error", "Pilihan tidak valid!", "#ED4245")] });
          }

          try {
            await distube.play(voiceChannel, results[choice - 1].url, {
              member: message.member,
              textChannel: message.channel,
              message,
            });
          } catch (error) {
            message.reply({
              embeds: [createMusicEmbed("❌ Error", `Gagal memutar: ${error.message}`, "#ED4245")],
            });
          }
        });

        collector.on("end", (collected) => {
          if (collected.size === 0) {
            searchMsg.edit({ embeds: [createMusicEmbed("⏰ Timeout", "Pencarian kedaluwarsa.", "#FEE75C")] });
          }
        });
      } catch (error) {
        message.reply({
          embeds: [createMusicEmbed("❌ Error", `Gagal mencari: ${error.message}`, "#ED4245")],
        });
      }
    },
  },

  // --- HELP ---
  help: {
    aliases: ["h", "bantuan", "commands", "cmd"],
    description: "Tampilkan daftar command",
    usage: `${PREFIX}help`,
    async execute(message) {
      const categories = {
        "🎵 Musik": ["play", "search", "stop", "skip", "pause", "resume", "seek"],
        "📋 Antrian": ["queue", "nowplaying", "shuffle", "remove", "loop", "autoplay"],
        "🔊 Kontrol": ["volume", "join", "leave", "stay"],
        "ℹ️ Info": ["help"],
      };

      let description = "**Bot Musik Discord 24/7** - Putar musik dari YouTube, Spotify & SoundCloud!\n\n";

      for (const [category, cmds] of Object.entries(categories)) {
        description += `**${category}**\n`;
        for (const cmdName of cmds) {
          const cmd = commands[cmdName];
          if (cmd) {
            const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map(a => `\`${a}\``).join(", ")})` : "";
            description += `> \`${cmd.usage}\`${aliases}\n> ${cmd.description}\n\n`;
          }
        }
      }

      description += `\n📡 **Sumber yang Didukung:**\n`;
      description += `> 🔴 YouTube - URL atau pencarian judul\n`;
      description += `> 🟢 Spotify - URL track, album, atau playlist\n`;
      description += `> 🟠 SoundCloud - URL track atau playlist\n`;
      description += `\n⚡ **Tips:** Kamu bisa langsung paste URL dari YouTube/Spotify/SoundCloud!`;

      message.reply({
        embeds: [createMusicEmbed("📖 Daftar Command", description)],
      });
    },
  },
};

// ============================================
// Buat alias map untuk lookup cepat
// ============================================
const aliasMap = new Map();
for (const [name, cmd] of Object.entries(commands)) {
  aliasMap.set(name, name);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      aliasMap.set(alias, name);
    }
  }
}

// ============================================
// Event: Bot Siap
// ============================================
client.on("ready", () => {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    🎵 Discord Music Bot 24/7 🎵     ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Bot    : ${client.user.tag.padEnd(25)}║`);
  console.log(`║  Server : ${String(client.guilds.cache.size).padEnd(25)}║`);
  console.log(`║  Prefix : ${PREFIX.padEnd(25)}║`);
  console.log("╚══════════════════════════════════════╝");

  // Set status bot
  client.user.setPresence({
    activities: [{ name: `${PREFIX}help | 🎵 Musik 24/7`, type: ActivityType.Listening }],
    status: "online",
  });

  // Auto-join default voice channel jika dikonfigurasi
  if (process.env.DEFAULT_VOICE_CHANNEL_ID) {
    const channel = client.channels.cache.get(process.env.DEFAULT_VOICE_CHANNEL_ID);
    if (channel) {
      distube.voices.join(channel).then(() => {
        stayChannels.set(channel.guild.id, channel.id);
        console.log(`✅ Auto-joined voice channel: ${channel.name}`);
      }).catch(err => {
        console.error(`❌ Gagal auto-join: ${err.message}`);
      });
    }
  }
});

// ============================================
// Event: Pesan Masuk (Command Handler)
// ============================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  if (!message.guild) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const resolvedName = aliasMap.get(commandName);
  if (!resolvedName) return;

  const command = commands[resolvedName];
  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(`Command error [${resolvedName}]:`, error);
    message.reply({
      embeds: [createMusicEmbed("❌ Error", `Terjadi kesalahan: ${error.message}`, "#ED4245")],
    });
  }
});

// ============================================
// Event: Button Interactions (Tombol Kontrol NowPlaying)
// ============================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const queue = getQueue(interaction.guildId);

  try {
    switch (interaction.customId) {
      case "music_pause":
        if (!queue) return interaction.reply({ content: "❌ Tidak ada musik!", ephemeral: true });
        if (queue.paused) {
          queue.resume();
          await interaction.reply({ content: "▶️ Musik dilanjutkan!", ephemeral: true });
        } else {
          queue.pause();
          await interaction.reply({ content: "⏸️ Musik di-pause!", ephemeral: true });
        }
        break;

      case "music_skip":
        if (!queue) return interaction.reply({ content: "❌ Tidak ada musik!", ephemeral: true });
        if (queue.songs.length <= 1) return interaction.reply({ content: "❌ Tidak ada lagu selanjutnya!", ephemeral: true });
        await queue.skip();
        await interaction.reply({ content: "⏭️ Lagu di-skip!", ephemeral: true });
        break;

      case "music_stop":
        if (!queue) return interaction.reply({ content: "❌ Tidak ada musik!", ephemeral: true });
        await queue.stop();
        await interaction.reply({ content: "⏹️ Musik dihentikan!", ephemeral: true });
        break;

      case "music_loop": {
        if (!queue) return interaction.reply({ content: "❌ Tidak ada musik!", ephemeral: true });
        const mode = (queue.repeatMode + 1) % 3;
        queue.setRepeatMode(mode);
        const modeText = ["Off", "Ulangi Lagu", "Ulangi Antrian"];
        await interaction.reply({ content: `🔁 Loop: **${modeText[mode]}**`, ephemeral: true });
        break;
      }

      case "music_shuffle":
        if (!queue) return interaction.reply({ content: "❌ Tidak ada musik!", ephemeral: true });
        await queue.shuffle();
        await interaction.reply({ content: "🔀 Antrian diacak!", ephemeral: true });
        break;
    }
  } catch (error) {
    console.error("Button interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
  }
});

// ============================================
// Event: Voice State Update (24/7 Stay Logic)
// ============================================
client.on("voiceStateUpdate", async (oldState, newState) => {
  // Jika bot di-disconnect, coba reconnect jika mode 24/7 aktif
  if (oldState.member?.id === client.user?.id && !newState.channelId) {
    const guildId = oldState.guild.id;
    const stayChannelId = stayChannels.get(guildId);

    if (stayChannelId) {
      // Tunggu sebentar sebelum reconnect
      setTimeout(async () => {
        try {
          const channel = client.channels.cache.get(stayChannelId);
          if (channel) {
            await distube.voices.join(channel);
            console.log(`🔄 Reconnected to ${channel.name} (24/7 mode)`);
          }
        } catch (error) {
          console.error(`❌ Failed to reconnect: ${error.message}`);
        }
      }, 3000);
    }
  }
});

// ============================================
// DisTube Events
// ============================================
distube.on("playSong", (queue, song) => {
  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("🎵 Sedang Memutar")
    .setDescription(`**[${song.name}](${song.url})**`)
    .setThumbnail(song.thumbnail || null)
    .addFields(
      { name: "⏱️ Durasi", value: formatDuration(song.duration), inline: true },
      { name: "👤 Diminta oleh", value: `${song.user}`, inline: true },
      { name: "📡 Sumber", value: getSourceEmoji(song.source), inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `🎵 Volume: ${queue.volume}% | Antrian: ${queue.songs.length} lagu` });

  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

distube.on("addSong", (queue, song) => {
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("➕ Ditambahkan ke Antrian")
    .setDescription(`**[${song.name}](${song.url})**`)
    .setThumbnail(song.thumbnail || null)
    .addFields(
      { name: "⏱️ Durasi", value: formatDuration(song.duration), inline: true },
      { name: "👤 Diminta oleh", value: `${song.user}`, inline: true },
      { name: "📋 Posisi", value: `#${queue.songs.length}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "🎵 Discord Music Bot 24/7" });

  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

distube.on("addList", (queue, playlist) => {
  const embed = new EmbedBuilder()
    .setColor("#EB459E")
    .setTitle("📋 Playlist Ditambahkan")
    .setDescription(`**[${playlist.name}](${playlist.url || ""})**`)
    .setThumbnail(playlist.thumbnail || null)
    .addFields(
      { name: "🎵 Jumlah Lagu", value: `${playlist.songs.length} lagu`, inline: true },
      { name: "👤 Diminta oleh", value: `${playlist.songs[0]?.user || "Unknown"}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "🎵 Discord Music Bot 24/7" });

  queue.textChannel?.send({ embeds: [embed] }).catch(() => {});
});

distube.on("finish", (queue) => {
  // Jika mode 24/7 aktif, jangan keluar dari voice channel
  if (stayChannels.has(queue.id)) {
    queue.textChannel?.send({
      embeds: [createMusicEmbed("🎵 Antrian Selesai", "Antrian telah selesai. Bot tetap di voice channel (mode 24/7).\nGunakan `!play` untuk memutar lagu lagi!", "#FEE75C")],
    }).catch(() => {});
    return;
  }

  queue.textChannel?.send({
    embeds: [createMusicEmbed("🎵 Antrian Selesai", "Antrian telah selesai. Bot akan keluar dari voice channel.", "#FEE75C")],
  }).catch(() => {});
});

distube.on("empty", (queue) => {
  // Jika mode 24/7 aktif, tetap di channel
  if (stayChannels.has(queue.id)) {
    return;
  }

  queue.textChannel?.send({
    embeds: [createMusicEmbed("👋 Channel Kosong", "Tidak ada orang di voice channel. Bot keluar.", "#FEE75C")],
  }).catch(() => {});
});

distube.on("error", (channel, error) => {
  console.error("DisTube Error:", error);
  if (channel) {
    channel.send({
      embeds: [createMusicEmbed("❌ Error", `Terjadi kesalahan: ${error.message}`, "#ED4245")],
    }).catch(() => {});
  }
});

distube.on("disconnect", (queue) => {
  // Jika mode 24/7 aktif, reconnect
  const stayChannelId = stayChannels.get(queue.id);
  if (stayChannelId) {
    setTimeout(async () => {
      try {
        const channel = client.channels.cache.get(stayChannelId);
        if (channel) {
          await distube.voices.join(channel);
          console.log(`🔄 Reconnected after disconnect (24/7 mode)`);
        }
      } catch (error) {
        console.error(`❌ Failed to reconnect after disconnect: ${error.message}`);
      }
    }, 3000);
  }
});

// ============================================
// Error Handling Global
// ============================================
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

// ============================================
// Login Bot
// ============================================
client.login(TOKEN);
