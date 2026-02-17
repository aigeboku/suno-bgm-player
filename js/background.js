// background.js - Service worker for managing playlist and playback state

let state = {
  playlist: [],
  currentIndex: -1,
  isPlaying: false,
  shuffle: true,
  repeat: true,
  volume: 0.5,
  currentTime: 0,
  duration: 0,
  currentSong: null,
  loading: false,
  loadingMessage: '',
  shuffledIndices: [],
  source: 'trending', // 'trending' or 'artist'
  artistData: null     // { handle, displayName, avatarUrl }
};

// ===== Offscreen Document Management =====
let offscreenCreated = false;

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
      offscreenCreated = true;
      return;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing Suno BGM audio in background'
    });
    offscreenCreated = true;
  } catch (e) {
    console.error('Failed to create offscreen document:', e);
  }
}

// ===== Suno Data Fetching =====

const PLAYLIST_IDS = {
  trending: '07653cdf-8f72-430e-847f-9ab8ac05af40'
};

// --- Trending Playlist ---
async function fetchTrendingPlaylist() {
  state.loading = true;
  state.loadingMessage = 'トレンド曲を読み込み中...';
  state.source = 'trending';
  state.artistData = null;
  broadcastState();

  try {
    const response = await fetch('https://suno.com/playlist/' + PLAYLIST_IDS.trending, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    const songs = parseSongsFromPage(html);

    if (songs.length > 0) {
      state.playlist = songs;
      generateShuffledIndices();
      await chrome.storage.local.set({ playlist: songs, lastFetch: Date.now(), source: 'trending' });
      console.log(`Loaded ${songs.length} songs from Suno trending`);
    } else {
      await loadCachedPlaylist();
    }
  } catch (e) {
    console.error('Failed to fetch trending playlist:', e);
    await loadCachedPlaylist();
  }

  state.loading = false;
  broadcastState();
}

// --- Artist Page ---
async function fetchArtistSongs(handle) {
  state.loading = true;
  state.loadingMessage = `@${handle} の曲を読み込み中...`;
  state.source = 'artist';
  broadcastState();

  try {
    const response = await fetch(`https://suno.com/@${handle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract artist profile info
    const artistData = extractArtistProfile(html, handle);
    state.artistData = artistData;

    // Extract songs from the SSR data
    const songs = extractArtistSongs(html);

    if (songs.length > 0) {
      state.playlist = songs;
      generateShuffledIndices();
      state.currentIndex = -1;
      state.currentSong = null;
      await chrome.storage.local.set({
        artistPlaylist: songs,
        artistData: artistData,
        source: 'artist',
        lastArtistHandle: handle
      });
      console.log(`Loaded ${songs.length} songs from @${handle}`);
    } else {
      console.warn(`No songs found for @${handle}`);
      // Try fallback: extract from song links
      const fallbackSongs = parseSongsFromPage(html);
      if (fallbackSongs.length > 0) {
        state.playlist = fallbackSongs;
        generateShuffledIndices();
        state.currentIndex = -1;
        state.currentSong = null;
      }
    }
  } catch (e) {
    console.error(`Failed to fetch artist @${handle}:`, e);
  }

  state.loading = false;
  broadcastState();
}

function extractArtistProfile(html, handle) {
  const unescaped = html.replace(/\\"/g, '"');

  let displayName = handle;
  let avatarUrl = '';

  // Extract display name
  const nameMatch = unescaped.match(/"display_name":"([^"]+)"/);
  if (nameMatch) {
    displayName = nameMatch[1];
  }

  // Extract avatar
  const avatarMatch = unescaped.match(/"avatar_image_url":"([^"]+)"/);
  if (avatarMatch) {
    avatarUrl = avatarMatch[1];
  }

  return { handle, displayName, avatarUrl };
}

function extractArtistSongs(html) {
  const songs = [];
  const seenIds = new Set();

  // Unescape the HTML (Next.js RSC format uses \" escaping)
  const unescaped = html.replace(/\\"/g, '"');

  // Find the clips array in the SSR data
  // Structure: "clips":[{...},{...},...], "playlists":
  const clipsStart = unescaped.indexOf('"clips":[');
  if (clipsStart === -1) {
    console.warn('No clips array found in artist page');
    return songs;
  }

  // Find the matching closing bracket
  const arrayStart = clipsStart + '"clips":'.length;
  let depth = 0;
  let arrayEnd = arrayStart;
  for (let i = arrayStart; i < Math.min(arrayStart + 200000, unescaped.length); i++) {
    if (unescaped[i] === '[') depth++;
    else if (unescaped[i] === ']') {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }

  const clipsStr = unescaped.substring(arrayStart, arrayEnd);

  // Extract individual song objects
  // Pattern: "title":"..." ... "id":"uuid" within each clip object
  const clipPattern = /"status":"complete","title":"([^"]*)"[^}]*?"id":"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"/g;
  let match;
  while ((match = clipPattern.exec(clipsStr)) !== null) {
    const title = match[1];
    const id = match[2];
    if (id !== '00000000-0000-0000-0000-000000000000' && !seenIds.has(id)) {
      seenIds.add(id);
      songs.push({
        id: id,
        title: decodeHTMLEntities(title),
        artist: '',
        audioUrl: `https://cdn1.suno.ai/${id}.mp3`,
        imageUrl: `https://cdn2.suno.ai/image_large_${id}.jpeg`
      });
    }
  }

  return songs;
}

// --- Shared parsing utilities ---
function parseSongsFromPage(html) {
  const songs = [];
  const seenIds = new Set();

  const songIdRegex = /\/song\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g;
  let match;
  while ((match = songIdRegex.exec(html)) !== null) {
    const id = match[1];
    if (!seenIds.has(id)) {
      seenIds.add(id);
      songs.push({
        id: id,
        title: '',
        artist: '',
        audioUrl: `https://cdn1.suno.ai/${id}.mp3`,
        imageUrl: `https://cdn2.suno.ai/image_large_${id}.jpeg`
      });
    }
  }

  // Try to extract titles
  const unescaped = html.replace(/\\"/g, '"');
  const titleRegex = /"title":"([^"]+)"[^}]*?"id":"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"/g;
  while ((match = titleRegex.exec(unescaped)) !== null) {
    const song = songs.find(s => s.id === match[2]);
    if (song && !song.title) {
      song.title = decodeHTMLEntities(match[1]);
    }
  }

  songs.forEach((song, i) => {
    if (!song.title) {
      song.title = `Suno Track #${i + 1}`;
    }
  });

  return songs;
}

function decodeHTMLEntities(text) {
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, m => entities[m] || m);
}

async function loadCachedPlaylist() {
  try {
    const cached = await chrome.storage.local.get(['playlist', 'source', 'artistPlaylist', 'artistData']);
    if (cached.source === 'artist' && cached.artistPlaylist?.length > 0) {
      state.playlist = cached.artistPlaylist;
      state.source = 'artist';
      state.artistData = cached.artistData;
    } else if (cached.playlist?.length > 0) {
      state.playlist = cached.playlist;
    }
    generateShuffledIndices();
  } catch (e) {
    console.error('Failed to load cached playlist:', e);
  }
}

// ===== Shuffle =====
function generateShuffledIndices() {
  state.shuffledIndices = [...Array(state.playlist.length).keys()];
  for (let i = state.shuffledIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.shuffledIndices[i], state.shuffledIndices[j]] = [state.shuffledIndices[j], state.shuffledIndices[i]];
  }
}

function getActualIndex(index) {
  if (state.shuffle && state.shuffledIndices.length > 0) {
    return state.shuffledIndices[index % state.shuffledIndices.length];
  }
  return index % state.playlist.length;
}

// ===== Playback Control =====
async function playSong(index) {
  if (state.playlist.length === 0) return;

  await ensureOffscreen();

  const actualIndex = getActualIndex(index);
  const song = state.playlist[actualIndex];
  if (!song) return;

  state.currentIndex = index;
  state.currentSong = { ...song };
  if (state.artistData) {
    state.currentSong.artist = state.artistData.displayName;
  }
  state.isPlaying = true;
  state.currentTime = 0;
  state.duration = 0;

  broadcastState();

  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'play',
      url: song.audioUrl
    });
  } catch (e) {
    console.error('Play failed:', e);
    setTimeout(() => playNext(), 1500);
  }
}

async function togglePlayPause() {
  await ensureOffscreen();

  if (state.isPlaying) {
    try {
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'pause' });
      state.isPlaying = false;
    } catch (e) {
      console.error('Pause failed:', e);
    }
  } else {
    if (state.currentSong) {
      try {
        await chrome.runtime.sendMessage({ target: 'offscreen', action: 'resume' });
        state.isPlaying = true;
      } catch (e) {
        console.error('Resume failed:', e);
      }
    } else if (state.playlist.length > 0) {
      await playSong(0);
      return;
    }
  }
  broadcastState();
}

async function playNext() {
  if (state.playlist.length === 0) return;

  let nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.playlist.length) {
    if (state.repeat) {
      nextIndex = 0;
      if (state.shuffle) generateShuffledIndices();
    } else {
      state.isPlaying = false;
      state.currentTime = 0;
      broadcastState();
      return;
    }
  }
  await playSong(nextIndex);
}

async function playPrev() {
  if (state.playlist.length === 0) return;

  if (state.currentTime > 3) {
    await playSong(state.currentIndex);
    return;
  }

  let prevIndex = state.currentIndex - 1;
  if (prevIndex < 0) {
    prevIndex = state.repeat ? state.playlist.length - 1 : 0;
  }
  await playSong(prevIndex);
}

async function setVolume(volume) {
  state.volume = Math.max(0, Math.min(1, volume));
  await ensureOffscreen();
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', action: 'setVolume', volume: state.volume });
  } catch (e) {
    console.error('Set volume failed:', e);
  }
  await chrome.storage.local.set({ volume: state.volume });
  broadcastState();
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  if (state.shuffle) generateShuffledIndices();
  chrome.storage.local.set({ shuffle: state.shuffle });
  broadcastState();
}

function toggleRepeat() {
  state.repeat = !state.repeat;
  chrome.storage.local.set({ repeat: state.repeat });
  broadcastState();
}

// ===== State Broadcasting =====
function broadcastState() {
  const stateToSend = getStateSnapshot();
  chrome.runtime.sendMessage({ action: 'stateUpdate', state: stateToSend }).catch(() => {});
}

function getStateSnapshot() {
  return {
    playlist: state.playlist.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      imageUrl: s.imageUrl
    })),
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    shuffle: state.shuffle,
    repeat: state.repeat,
    volume: state.volume,
    currentTime: state.currentTime,
    duration: state.duration,
    currentSong: state.currentSong ? {
      id: state.currentSong.id,
      title: state.currentSong.title,
      artist: state.currentSong.artist,
      imageUrl: state.currentSong.imageUrl
    } : null,
    loading: state.loading,
    loadingMessage: state.loadingMessage,
    playlistLength: state.playlist.length,
    source: state.source,
    artistData: state.artistData
  };
}

// ===== Message Handling =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getState':
      sendResponse(getStateSnapshot());
      break;

    case 'togglePlayPause':
      togglePlayPause();
      sendResponse({ ok: true });
      break;

    case 'next':
      playNext();
      sendResponse({ ok: true });
      break;

    case 'prev':
      playPrev();
      sendResponse({ ok: true });
      break;

    case 'setVolume':
      setVolume(message.volume);
      sendResponse({ ok: true });
      break;

    case 'toggleShuffle':
      toggleShuffle();
      sendResponse({ ok: true });
      break;

    case 'toggleRepeat':
      toggleRepeat();
      sendResponse({ ok: true });
      break;

    case 'refreshPlaylist':
      fetchTrendingPlaylist();
      sendResponse({ ok: true });
      break;

    case 'loadArtist':
      fetchArtistSongs(message.handle);
      sendResponse({ ok: true });
      break;

    case 'switchSource':
      if (message.source === 'trending') {
        fetchTrendingPlaylist();
      }
      sendResponse({ ok: true });
      break;

    case 'playSongAtIndex':
      const directIndex = message.index;
      if (state.shuffle) {
        const shuffledPos = state.shuffledIndices.indexOf(directIndex);
        if (shuffledPos >= 0) {
          playSong(shuffledPos);
        } else {
          state.currentIndex = 0;
          state.currentSong = { ...state.playlist[directIndex] };
          if (state.artistData) state.currentSong.artist = state.artistData.displayName;
          state.isPlaying = true;
          broadcastState();
          ensureOffscreen().then(() => {
            chrome.runtime.sendMessage({
              target: 'offscreen',
              action: 'play',
              url: state.playlist[directIndex].audioUrl
            }).catch(() => {});
          });
        }
      } else {
        playSong(directIndex);
      }
      sendResponse({ ok: true });
      break;

    // Messages from offscreen document
    case 'songEnded':
      playNext();
      break;

    case 'timeUpdate':
      state.currentTime = message.currentTime;
      state.duration = message.duration;
      broadcastState();
      break;

    case 'playbackStarted':
      state.isPlaying = true;
      broadcastState();
      break;

    case 'playbackError':
      console.error('Playback error:', message.error);
      setTimeout(() => playNext(), 1000);
      break;
  }
});

// ===== Initialization =====
async function init() {
  const saved = await chrome.storage.local.get(['volume', 'shuffle', 'repeat', 'source', 'lastArtistHandle']);
  if (saved.volume !== undefined) state.volume = saved.volume;
  if (saved.shuffle !== undefined) state.shuffle = saved.shuffle;
  if (saved.repeat !== undefined) state.repeat = saved.repeat;

  // Restore last source
  if (saved.source === 'artist' && saved.lastArtistHandle) {
    await fetchArtistSongs(saved.lastArtistHandle);
  } else {
    await fetchTrendingPlaylist();
  }
}

init();
