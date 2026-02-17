// popup.js - UI logic for the popup

// === DOM Elements ===
const albumArt = document.getElementById('album-art');
const albumPlaceholder = document.getElementById('album-placeholder');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressFill = document.getElementById('progress-fill');
const progressBar = document.getElementById('progress-bar');
const btnPlay = document.getElementById('btn-play');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnShuffle = document.getElementById('btn-shuffle');
const btnRepeat = document.getElementById('btn-repeat');
const btnRefresh = document.getElementById('btn-refresh');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const btnTogglePlaylist = document.getElementById('btn-toggle-playlist');
const playlistSection = document.getElementById('playlist-section');
const playlistContainer = document.getElementById('playlist');
const playlistCount = document.getElementById('playlist-count');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Source tabs
const tabTrending = document.getElementById('tab-trending');
const tabArtist = document.getElementById('tab-artist');
const tabFavorites = document.getElementById('tab-favorites');
const artistSearch = document.getElementById('artist-search');
const artistInput = document.getElementById('artist-input');
const btnLoadArtist = document.getElementById('btn-load-artist');
const artistInfo = document.getElementById('artist-info');
const artistAvatar = document.getElementById('artist-avatar');
const artistName = document.getElementById('artist-name');
const artistHandle = document.getElementById('artist-handle');
const favoritesSection = document.getElementById('favorites-section');
const favoritesList = document.getElementById('favorites-list');

// Favorite button
const btnFavorite = document.getElementById('btn-favorite');
const iconHeartOutline = document.getElementById('icon-heart-outline');
const iconHeartFilled = document.getElementById('icon-heart-filled');

// === State ===
let currentState = null;
let playlistVisible = false;
let currentSource = 'trending'; // 'trending', 'artist', or 'favorites'

// === Helpers ===
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// === Source Tab Switching ===
function setActiveTab(tab) {
  tabTrending.classList.remove('active');
  tabArtist.classList.remove('active');
  tabFavorites.classList.remove('active');
  tab.classList.add('active');
  artistSearch.classList.add('hidden');
  favoritesSection.classList.add('hidden');
}

tabTrending.addEventListener('click', () => {
  currentSource = 'trending';
  setActiveTab(tabTrending);
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response && response.source !== 'trending') {
      chrome.runtime.sendMessage({ action: 'switchSource', source: 'trending' });
    }
  });
});

tabArtist.addEventListener('click', () => {
  currentSource = 'artist';
  setActiveTab(tabArtist);
  artistSearch.classList.remove('hidden');
  artistInput.focus();
});

tabFavorites.addEventListener('click', () => {
  currentSource = 'favorites';
  setActiveTab(tabFavorites);
  favoritesSection.classList.remove('hidden');
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      renderFavorites(response);
      if (response.source !== 'favorites') {
        chrome.runtime.sendMessage({ action: 'switchSource', source: 'favorites' });
      }
    }
  });
});

// === Artist Search ===
function loadArtist() {
  let handle = artistInput.value.trim();
  if (!handle) return;

  // Remove @ prefix if present
  handle = handle.replace(/^@/, '');
  // Remove URL prefix if pasted full URL
  handle = handle.replace(/^https?:\/\/suno\.com\/@?/, '');
  handle = handle.replace(/\/$/, '');

  if (!handle) return;

  btnLoadArtist.disabled = true;
  artistInput.value = handle;

  chrome.runtime.sendMessage({
    action: 'loadArtist',
    handle: handle
  });
}

btnLoadArtist.addEventListener('click', loadArtist);

artistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    loadArtist();
  }
});

// === UI Update ===
function updateUI(state) {
  currentState = state;

  // Loading
  if (state.loading) {
    loadingOverlay.classList.remove('hidden');
    loadingText.textContent = state.loadingMessage || '曲を読み込み中...';
  } else {
    loadingOverlay.classList.add('hidden');
  }

  // Update source tabs
  if (state.source === 'artist') {
    currentSource = 'artist';
    setActiveTab(tabArtist);
    artistSearch.classList.remove('hidden');

    // Show artist info
    if (state.artistData) {
      artistInfo.classList.remove('hidden');
      artistName.textContent = state.artistData.displayName || state.artistData.handle;
      artistHandle.textContent = '@' + state.artistData.handle;
      if (state.artistData.avatarUrl) {
        artistAvatar.src = state.artistData.avatarUrl;
        artistAvatar.style.display = 'block';
      }
      if (document.activeElement !== artistInput) {
        artistInput.value = state.artistData.handle;
      }
    }
  } else if (state.source === 'favorites') {
    currentSource = 'favorites';
    setActiveTab(tabFavorites);
    favoritesSection.classList.remove('hidden');
    renderFavorites(state);
  } else {
    if (currentSource === 'trending') {
      setActiveTab(tabTrending);
    }
  }

  // Favorite button state
  if (state.currentSong && state.favorites) {
    const isFav = state.favorites.some(f => f.id === state.currentSong.id);
    btnFavorite.classList.toggle('active', isFav);
    iconHeartOutline.style.display = isFav ? 'none' : 'block';
    iconHeartFilled.style.display = isFav ? 'block' : 'none';
    btnFavorite.title = isFav ? 'お気に入りから削除' : 'お気に入りに追加';
  } else {
    btnFavorite.classList.remove('active');
    iconHeartOutline.style.display = 'block';
    iconHeartFilled.style.display = 'none';
  }

  // Update favorites list if visible
  if (currentSource === 'favorites') {
    renderFavorites(state);
  }

  // Re-enable load button
  btnLoadArtist.disabled = false;

  // Song info
  if (state.currentSong) {
    songTitle.textContent = state.currentSong.title || 'Unknown';
    songArtist.textContent = state.currentSong.artist || (state.artistData ? state.artistData.displayName : 'Suno');

    // Album art
    const imgUrl = state.currentSong.imageUrl;
    if (imgUrl) {
      albumArt.src = imgUrl;
      albumArt.onload = () => albumArt.classList.add('loaded');
      albumArt.onerror = () => {
        albumArt.classList.remove('loaded');
        const altUrl = `https://cdn2.suno.ai/image_${state.currentSong.id}.jpeg`;
        if (albumArt.src !== altUrl) {
          albumArt.src = altUrl;
        }
      };
    }
  } else {
    songTitle.textContent = '曲を選択してください';
    songArtist.textContent = 'Suno BGM Player';
    albumArt.classList.remove('loaded');
  }

  // Play/Pause icon
  if (state.isPlaying) {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
  } else {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
  }

  // Progress
  timeCurrent.textContent = formatTime(state.currentTime);
  timeTotal.textContent = formatTime(state.duration);
  if (state.duration > 0) {
    const pct = (state.currentTime / state.duration) * 100;
    progressFill.style.width = `${pct}%`;
  } else {
    progressFill.style.width = '0%';
  }

  // Shuffle & Repeat
  btnShuffle.classList.toggle('active', state.shuffle);
  btnRepeat.classList.toggle('active', state.repeat);

  // Volume
  volumeSlider.value = Math.round(state.volume * 100);
  volumeValue.textContent = `${Math.round(state.volume * 100)}%`;

  // Playlist count
  playlistCount.textContent = `${state.playlistLength || 0}曲`;

  // Update playlist if visible
  if (playlistVisible) {
    renderPlaylist(state);
  }
}

function renderPlaylist(state) {
  if (!state.playlist || state.playlist.length === 0) {
    playlistContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#555;font-size:13px;">プレイリストが空です</div>';
    return;
  }

  const currentSongId = state.currentSong?.id;

  playlistContainer.innerHTML = state.playlist.map((song, index) => {
    const isActive = song.id === currentSongId;
    return `
      <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${index}">
        <span class="playlist-item-index">${isActive && state.isPlaying ? '' : (index + 1)}</span>
        ${isActive && state.isPlaying ? `
          <div class="playlist-item-playing">
            <div class="playing-bars"><span></span><span></span><span></span></div>
          </div>
        ` : ''}
        <span class="playlist-item-title">${song.title || 'Unknown Track'}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      chrome.runtime.sendMessage({ action: 'playSongAtIndex', index });
    });
  });

  // Scroll active item into view
  const activeItem = playlistContainer.querySelector('.playlist-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// === Favorites ===
function renderFavorites(state) {
  if (!state.favorites || state.favorites.length === 0) {
    favoritesList.innerHTML = '<div class="favorites-empty">お気に入りに曲を追加してください<br>再生中の曲のハートボタンで追加できます</div>';
    return;
  }

  const currentSongId = state.currentSong?.id;

  favoritesList.innerHTML = state.favorites.map((song, index) => {
    const isActive = song.id === currentSongId && state.source === 'favorites';
    return `
      <div class="favorites-item ${isActive ? 'active' : ''}" data-id="${song.id}" data-index="${index}">
        <div class="favorites-item-info">
          <div class="favorites-item-title">${song.title || 'Unknown Track'}</div>
          <div class="favorites-item-artist">${song.artist || 'Suno'}</div>
        </div>
        <button class="favorites-item-remove" data-id="${song.id}" title="削除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Click to play
  favoritesList.querySelectorAll('.favorites-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.favorites-item-remove')) return;
      const index = parseInt(item.dataset.index);
      if (state.source !== 'favorites') {
        chrome.runtime.sendMessage({ action: 'switchSource', source: 'favorites' });
      }
      chrome.runtime.sendMessage({ action: 'playSongAtIndex', index });
    });
  });

  // Remove from favorites
  favoritesList.querySelectorAll('.favorites-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'removeFavorite', id: btn.dataset.id });
    });
  });
}

btnFavorite.addEventListener('click', () => {
  if (!currentState?.currentSong) return;
  const song = currentState.currentSong;
  const isFav = currentState.favorites?.some(f => f.id === song.id);
  if (isFav) {
    chrome.runtime.sendMessage({ action: 'removeFavorite', id: song.id });
  } else {
    chrome.runtime.sendMessage({ action: 'addFavorite', songId: song.id });
  }
});

// === Event Listeners ===
btnPlay.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'togglePlayPause' });
});

btnNext.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'next' });
});

btnPrev.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'prev' });
});

btnShuffle.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'toggleShuffle' });
});

btnRepeat.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'toggleRepeat' });
});

btnRefresh.addEventListener('click', () => {
  btnRefresh.classList.add('spinning');
  if (currentSource === 'artist' && currentState?.artistData?.handle) {
    chrome.runtime.sendMessage({ action: 'loadArtist', handle: currentState.artistData.handle });
  } else {
    chrome.runtime.sendMessage({ action: 'refreshPlaylist' });
  }
  setTimeout(() => btnRefresh.classList.remove('spinning'), 2000);
});

volumeSlider.addEventListener('input', (e) => {
  const vol = parseInt(e.target.value) / 100;
  volumeValue.textContent = `${e.target.value}%`;
  chrome.runtime.sendMessage({ action: 'setVolume', volume: vol });
});

btnTogglePlaylist.addEventListener('click', () => {
  playlistVisible = !playlistVisible;
  playlistSection.classList.toggle('hidden', !playlistVisible);
  btnTogglePlaylist.classList.toggle('expanded', playlistVisible);
  if (playlistVisible && currentState) {
    renderPlaylist(currentState);
  }
});

// === Message Listener ===
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateUpdate') {
    updateUI(message.state);
  }
});

// === Init ===
chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
  if (response) {
    updateUI(response);
  }
});
