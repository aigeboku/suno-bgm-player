// offscreen.js - Handles actual audio playback in offscreen document
const audio = document.getElementById('audio-player');

let currentVolume = 0.5;

audio.volume = currentVolume;

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  switch (message.action) {
    case 'play':
      audio.src = message.url;
      audio.volume = currentVolume;
      audio.play().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // async response

    case 'pause':
      audio.pause();
      sendResponse({ success: true });
      break;

    case 'resume':
      audio.play().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'setVolume':
      currentVolume = message.volume;
      audio.volume = currentVolume;
      sendResponse({ success: true });
      break;

    case 'getState':
      sendResponse({
        playing: !audio.paused,
        currentTime: audio.currentTime,
        duration: audio.duration || 0,
        volume: audio.volume,
        src: audio.src
      });
      break;
  }
});

// Notify background when song ends
audio.addEventListener('ended', () => {
  chrome.runtime.sendMessage({ action: 'songEnded' });
});

// Notify background of time updates (throttled)
let lastTimeUpdate = 0;
audio.addEventListener('timeupdate', () => {
  const now = Date.now();
  if (now - lastTimeUpdate > 1000) {
    lastTimeUpdate = now;
    chrome.runtime.sendMessage({
      action: 'timeUpdate',
      currentTime: audio.currentTime,
      duration: audio.duration || 0
    });
  }
});

// Notify when audio starts playing
audio.addEventListener('playing', () => {
  chrome.runtime.sendMessage({ action: 'playbackStarted' });
});

// Notify on error
audio.addEventListener('error', () => {
  chrome.runtime.sendMessage({ action: 'playbackError', error: audio.error?.message || 'Unknown error' });
});
