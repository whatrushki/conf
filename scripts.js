/**
 * WHAT CONF - Vanilla UI Controller (100% Precision Fixes)
 */

import {
    net,
    P2PAuditLog,
    soundFx,
    localVAD,
    createSilentAudioTrack,
    createBlackVideoTrack,
    isPlaceholderTrack,
    listRealVideoDevices,
    listRealAudioDevices,
    pickCameraDeviceId,
    unlockAudioEngine,
    P2PNet
} from './net.js';

// ==========================================
// 1. STATE & UTILS
// ==========================================
const AVATAR_PALETTE = [
    '#6d8390', '#7a8f6e', '#8f7a6e', '#7a6e8f',
    '#6e8f8a', '#8f8a6e', '#6e7a8f', '#8f6e7a',
    '#708f7d', '#8f7070', '#70708f', '#8f7d70',
];

function avatarColorForId(id) {
    let hash = 0;
    const s = id || 'x';
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const state = {
    roomId: null,
    myName: 'User',
    isMicOn: true,
    isCamOn: true,
    isScreenSharing: false,
    isHandRaised: false,
    currentFacingMode: 'user',
    isMirrored: true,
    localStream: null,
    localScreenStream: null,
    isLocalSpeaking: false,
    pinnedId: null,
    fullscreenTileId: null,
    fullscreenTimer: null,
    peers: {},
    screenStreams: {},
    activeScreenWatches: {},
    messages: [],
    unreadCount: 0,
    isAdmin: false,
    hostId: null,
    hostName: '',
    isLocked: false,
    allowScreenShare: true,
    soundEnabled: true,
    soundVolume: 0.5,
    showChatToasts: true,
    barCollapsed: false,
    isChatOpen: false,
    activeDropdownPeerId: null,
    selectedVideoDeviceId: null,
    selectedAudioDeviceId: null
};

// ==========================================
// 2. TOASTS (Sonner UI)
// ==========================================
export const toast = {
    show(title, desc = '', type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const item = document.createElement('div');
        item.className = 'toast-item';
        item.innerHTML = `
      <div class="toast-item-title">${title}</div>
      ${desc ? `<div class="toast-item-desc">${desc}</div>` : ''}
    `;
        item.onclick = () => {
            openChatSidebar();
            item.remove();
        };
        container.appendChild(item);
        setTimeout(() => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(10px)';
            item.style.transition = 'all 0.2s ease';
            setTimeout(() => item.remove(), 200);
        }, 4500);
    },
    success(msg) { this.show(msg, '', 'success'); },
    error(msg) { this.show(msg, '', 'error'); }
};

// ==========================================
// 3. GRID LAYOUT CALCULATOR
// ==========================================
function computeConferenceGrid(count, isMobile, containerW = 0, containerH = 0) {
    const n = Math.max(1, count);
    if (n === 1) return { cols: 1, rows: 1, stretchLast: false };

    if (isMobile) {
        if (n === 2) return { cols: 1, rows: 2, stretchLast: false };
        const cols = 2;
        const rows = Math.ceil(n / cols);
        return { cols, rows, stretchLast: n % cols === 1 };
    }

    if (n === 2) return { cols: 2, rows: 1, stretchLast: false };
    if (n <= 4) {
        const cols = 2;
        const rows = Math.ceil(n / cols);
        return { cols, rows, stretchLast: n % cols === 1 };
    }

    let cols = 4;
    if (containerW > 0 && containerH > 0) {
        const rows4 = Math.ceil(n / 4);
        const rows2 = Math.ceil(n / 2);
        const cell4 = (containerW / 4) * (containerH / rows4);
        const cell2 = (containerW / 2) * (containerH / rows2);
        cols = cell4 >= cell2 ? 4 : 2;
    }
    const rows = Math.ceil(n / cols);
    return { cols, rows, stretchLast: n % cols === 1 };
}

// ==========================================
// 4. LOBBY CONTROLLER
// ==========================================
const lobbyVideo = document.getElementById('lobbyPreviewVideo');
const lobbyAvatar = document.getElementById('lobbyAvatarFallback');

async function initLobbyPreview() {
    try {
        const deviceId = await pickCameraDeviceId(state.currentFacingMode);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId
                ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { facingMode: { ideal: state.currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        if (!stream.getAudioTracks().length) stream.addTrack(createSilentAudioTrack());
        if (!stream.getVideoTracks().length) stream.addTrack(createBlackVideoTrack());

        state.localStream = stream;
        net.localStream = stream;
        if (lobbyVideo) lobbyVideo.srcObject = stream;
        if (lobbyAvatar) lobbyAvatar.classList.add('hidden');
        localVAD.start(stream, true);
    } catch (e) {
        console.error('Camera init error', e);
        const shell = new MediaStream([createSilentAudioTrack(), createBlackVideoTrack()]);
        state.localStream = shell;
        net.localStream = shell;
        state.isCamOn = false;
        state.isMicOn = false;
        if (lobbyAvatar) lobbyAvatar.classList.remove('hidden');
    }
    updateLobbyButtons();
}

function updateLobbyButtons() {
    const micTxt = document.getElementById('lobbyMicText');
    const camTxt = document.getElementById('lobbyCamText');
    if (micTxt) micTxt.textContent = state.isMicOn ? 'Mic' : 'Off';
    if (camTxt) camTxt.textContent = state.isCamOn ? 'Cam' : 'Off';
    if (lobbyAvatar) {
        if (state.isCamOn) lobbyAvatar.classList.add('hidden');
        else lobbyAvatar.classList.remove('hidden');
    }
    if (window.lucide) window.lucide.createIcons();
}

// ==========================================
// 5. CONFERENCE VIEW & VIDEO RENDERING
// ==========================================
const confGrid = document.getElementById('confGrid');
const confLeftPane = document.getElementById('confLeftPane');

function renderConferenceGrid() {
    if (!confGrid || !state.roomId) return;

    // Fullscreen mode cancels grid layout entirely
    if (state.fullscreenTileId) {
        confGrid.className = 'conf-grid is-in-fullscreen';
        confGrid.style.gridTemplateColumns = '';
        confGrid.style.gridTemplateRows = '';
    } else if (!state.pinnedId) {
        const totalCount =
            1 +
            (state.isScreenSharing && state.localScreenStream ? 1 : 0) +
            Object.keys(state.screenStreams).length +
            Object.keys(state.peers).length;

        const isCompact = (confLeftPane ? confLeftPane.clientWidth : window.innerWidth) <= 720;
        const layout = computeConferenceGrid(totalCount, isCompact, confGrid.clientWidth, confGrid.clientHeight);

        confGrid.className = `conf-grid ${layout.stretchLast ? 'stretch-last' : ''}`;
        confGrid.style.gridTemplateColumns = `repeat(${layout.cols}, minmax(0, 1fr))`;
        confGrid.style.gridTemplateRows = `repeat(${layout.rows}, minmax(0, 1fr))`;
    } else {
        confGrid.className = 'conf-grid has-stage';
        confGrid.style.gridTemplateColumns = '';
        confGrid.style.gridTemplateRows = '';
    }

    // 1. Local Video Tile
    let localTile = document.getElementById('tile-local');
    if (!localTile) {
        localTile = createVideoTileElement('local', `${state.myName} (Вы)`, true);
        confGrid.appendChild(localTile);
    }
    updateTileContent(localTile, {
        id: 'local',
        name: `${state.myName} (Вы)`,
        isMicOn: state.isMicOn,
        isCamOn: state.isCamOn,
        isHandRaised: state.isHandRaised,
        isSpeaking: state.isLocalSpeaking,
        stream: state.localStream,
        isHost: state.isAdmin,
        isMirrored: state.isMirrored && state.currentFacingMode === 'user'
    });

    // 2. Local Screen Tile (Always immediately playing for sharer)
    let localScreenTile = document.getElementById('tile-local-screen');
    if (state.isScreenSharing && state.localScreenStream) {
        if (!localScreenTile) {
            localScreenTile = createScreenTileElement('local-screen', `${state.myName} (Экран)`, true);
            confGrid.appendChild(localScreenTile);
        }
        updateScreenTile(localScreenTile, {
            id: 'local-screen',
            name: `${state.myName} (Экран)`,
            stream: state.localScreenStream
        }, true);
    } else if (localScreenTile) {
        localScreenTile.remove();
    }

    // 3. Remote Screen Tiles
    Object.values(state.screenStreams).forEach(screen => {
        const tileId = `tile-screen-${screen.id}`;
        let tile = document.getElementById(tileId);
        if (!tile) {
            tile = createScreenTileElement(tileId, `${screen.name} (Экран)`, false, screen.id);
            confGrid.appendChild(tile);
        }
        updateScreenTile(tile, screen, false);
    });

    // Remove stale screen tiles
    confGrid.querySelectorAll('.screen-tile:not(#tile-local-screen)').forEach(el => {
        const rawId = el.id.replace('tile-screen-', '');
        if (!state.screenStreams[rawId]) el.remove();
    });

    // 4. Remote Peer Video Tiles
    Object.values(state.peers).forEach(peer => {
        const tileId = `tile-peer-${peer.id}`;
        let tile = document.getElementById(tileId);
        if (!tile) {
            tile = createVideoTileElement(tileId, peer.name, false, peer.id);
            confGrid.appendChild(tile);
        }
        updateTileContent(tile, {
            ...peer,
            isHost: state.hostId === peer.id
        });
    });

    // Remove stale peer tiles
    confGrid.querySelectorAll('.video-tile:not(.screen-tile):not(#tile-local)').forEach(el => {
        const rawId = el.id.replace('tile-peer-', '');
        if (!state.peers[rawId]) el.remove();
    });

    if (window.lucide) window.lucide.createIcons();
}

function toggleTileFullscreen(tile) {
    const appRoot = document.getElementById('appRoot');
    const isCurrentlyFullscreen = tile.classList.contains('is-fullscreen');

    if (isCurrentlyFullscreen) {
        tile.classList.remove('is-fullscreen', 'mouse-active');
        appRoot.classList.remove('app-fullscreen-mode');
        state.fullscreenTileId = null;
        if (state.fullscreenTimer) clearTimeout(state.fullscreenTimer);
    } else {
        document.querySelectorAll('.video-tile.is-fullscreen').forEach(t => t.classList.remove('is-fullscreen', 'mouse-active'));
        tile.classList.add('is-fullscreen', 'mouse-active');
        appRoot.classList.add('app-fullscreen-mode');
        state.fullscreenTileId = tile.id;
        triggerFullscreenActivity(tile);
    }
    renderConferenceGrid();
}

function triggerFullscreenActivity(tile) {
    tile.classList.add('mouse-active');
    if (state.fullscreenTimer) clearTimeout(state.fullscreenTimer);
    state.fullscreenTimer = setTimeout(() => {
        tile.classList.remove('mouse-active');
    }, 2500);
}

function createVideoTileElement(id, name, isLocal, peerId = null) {
    const tile = document.createElement('div');
    tile.id = id.startsWith('tile-') ? id : `tile-${id}`;
    tile.className = 'video-tile';

    tile.innerHTML = `
    <video autoplay playsinline ${isLocal ? 'muted' : ''}></video>
    <div class="tile-avatar" style="background: ${avatarColorForId(peerId || name)};">
      <span class="material-symbols-outlined" style="color: rgba(255,255,255,0.92);">person</span>
    </div>
    <div class="tile-hover-controls">
      <button class="tile-ctrl-btn btn-pin" title="Закрепить"><i data-lucide="pin" style="width: 16px; height: 16px;"></i></button>
      <button class="tile-ctrl-btn btn-fullscreen" title="Во весь экран"><i data-lucide="maximize" style="width: 16px; height: 16px;"></i></button>
      ${!isLocal ? `<button class="tile-ctrl-btn btn-more" title="Опции"><i data-lucide="more-vertical" style="width: 16px; height: 16px;"></i></button>` : ''}
    </div>
    <div class="tile-overlay">
      <div class="tile-top-actions">
        <div class="hand-badge hidden">✋ Рука</div>
      </div>
      <div class="tile-tag">
        <i data-lucide="mic" class="tile-mic-icon" style="width: 14px; height: 14px; color: #10b981;"></i>
        <span class="tile-name-text">${name}</span>
        <i data-lucide="crown" class="tile-crown-icon hidden" style="width: 14px; height: 14px; color: #f59e0b;" title="Организатор"></i>
      </div>
    </div>
    <button type="button" class="fullscreen-chat-btn" title="Чат">
      <i data-lucide="message-square" style="width: 20px; height: 20px;"></i>
    </button>
  `;

    tile.querySelector('.btn-pin').onclick = () => {
        state.pinnedId = state.pinnedId === tile.id ? null : tile.id;
        renderConferenceGrid();
    };

    tile.querySelector('.btn-fullscreen').onclick = () => {
        toggleTileFullscreen(tile);
    };

    tile.querySelector('.fullscreen-chat-btn').onclick = (e) => {
        e.stopPropagation();
        if (state.isChatOpen) closeChatSidebar();
        else openChatSidebar();
    };

    tile.onmousemove = () => {
        if (tile.classList.contains('is-fullscreen')) {
            triggerFullscreenActivity(tile);
        }
    };

    const moreBtn = tile.querySelector('.btn-more');
    if (moreBtn && peerId) {
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            openTileDropdown(e.clientX, e.clientY, peerId, tile.id);
        };
    }

    return tile;
}

function updateTileContent(tile, data) {
    if (!tile) return;
    const vid = tile.querySelector('video');
    const avatar = tile.querySelector('.tile-avatar');
    const hand = tile.querySelector('.hand-badge');
    const micIcon = tile.querySelector('.tile-mic-icon');
    const crown = tile.querySelector('.tile-crown-icon');

    if (state.pinnedId === tile.id) tile.classList.add('is-stage');
    else tile.classList.remove('is-stage');

    if (state.fullscreenTileId === tile.id) tile.classList.add('is-fullscreen');
    else tile.classList.remove('is-fullscreen');

    if (data.isSpeaking) tile.classList.add('speaking');
    else tile.classList.remove('speaking');

    if (data.isMirrored) tile.classList.add('mirrored');
    else tile.classList.remove('mirrored');

    if (hand) {
        if (data.isHandRaised) hand.classList.remove('hidden');
        else hand.classList.add('hidden');
    }

    if (crown) {
        if (data.isHost) crown.classList.remove('hidden');
        else crown.classList.add('hidden');
    }

    if (micIcon) {
        if (data.isMicOn) {
            micIcon.setAttribute('data-lucide', 'mic');
            micIcon.style.color = '#10b981';
        } else {
            micIcon.setAttribute('data-lucide', 'mic-off');
            micIcon.style.color = '#ef4444';
        }
    }

    const liveVideo = data.stream?.getVideoTracks().find(t => t.readyState === 'live' && !isPlaceholderTrack(t));
    const showVideo = !!data.isCamOn && !!liveVideo;

    if (showVideo) {
        if (avatar) avatar.classList.add('hidden');
        if (vid) {
            if (vid.srcObject !== data.stream) {
                vid.srcObject = data.stream;
            }
            // Guarantee resume if paused by backgrounding/fullscreen
            if (vid.paused) {
                vid.play().catch(() => { });
            }
        }
    } else {
        if (avatar) avatar.classList.remove('hidden');
        if (vid) vid.srcObject = null;
    }
}

function createScreenTileElement(id, name, isLocal, peerId = null) {
    const tile = document.createElement('div');
    tile.id = id;
    tile.className = 'video-tile screen-tile';
    tile.innerHTML = `
    <video autoplay playsinline muted></video>
    <div class="stream-discord-card ${isLocal ? 'hidden' : ''}">
      <div class="stream-discord-icon"><span class="material-symbols-outlined">desktop_windows</span></div>
      <div class="stream-discord-title">Трансляция экрана</div>
      <div class="stream-discord-desc">${name} делится экраном</div>
      <button type="button" class="studio-btn-primary btn-watch-stream" style="margin-top: 8px;">Смотреть стрим</button>
    </div>
    <div class="tile-hover-controls">
      <button class="tile-ctrl-btn btn-pin"><i data-lucide="pin" style="width: 16px; height: 16px;"></i></button>
      <button class="tile-ctrl-btn btn-fullscreen"><i data-lucide="maximize" style="width: 16px; height: 16px;"></i></button>
      ${!isLocal && state.isAdmin ? `<button class="tile-ctrl-btn btn-stop-admin" title="Остановить показ (Админ)"><i data-lucide="stop-circle" style="width: 16px; height: 16px; color: #ef4444;"></i></button>` : ''}
    </div>
    <div class="tile-overlay">
      <div class="tile-top-actions"></div>
      <div class="tile-tag">
        <span class="material-symbols-outlined" style="font-size: 14px; color: #60a5fa;">screen_share</span>
        <span>${name}</span>
      </div>
    </div>
    <button type="button" class="fullscreen-chat-btn" title="Чат">
      <i data-lucide="message-square" style="width: 20px; height: 20px;"></i>
    </button>
  `;

    tile.querySelector('.btn-pin').onclick = () => {
        state.pinnedId = state.pinnedId === tile.id ? null : tile.id;
        renderConferenceGrid();
    };

    tile.querySelector('.btn-fullscreen').onclick = () => {
        toggleTileFullscreen(tile);
    };

    tile.querySelector('.fullscreen-chat-btn').onclick = (e) => {
        e.stopPropagation();
        if (state.isChatOpen) closeChatSidebar();
        else openChatSidebar();
    };

    tile.onmousemove = () => {
        if (tile.classList.contains('is-fullscreen')) {
            triggerFullscreenActivity(tile);
        }
    };

    const watchBtn = tile.querySelector('.btn-watch-stream');
    if (watchBtn && peerId) {
        watchBtn.onclick = () => {
            state.activeScreenWatches[peerId] = true;
            renderConferenceGrid();
        };
    }

    const stopAdminBtn = tile.querySelector('.btn-stop-admin');
    if (stopAdminBtn && peerId) {
        stopAdminBtn.onclick = () => {
            net.send({ type: 'FORCE_STOP_SCREEN' }, peerId);
            toast.success("Демонстрация остановлена администратором");
        };
    }

    return tile;
}

function updateScreenTile(tile, screen, isLocal) {
    if (!tile) return;
    const vid = tile.querySelector('video');
    const discordCard = tile.querySelector('.stream-discord-card');

    if (state.pinnedId === tile.id) tile.classList.add('is-stage');
    else tile.classList.remove('is-stage');

    if (state.fullscreenTileId === tile.id) tile.classList.add('is-fullscreen');
    else tile.classList.remove('is-fullscreen');

    const isWatching = isLocal || !!state.activeScreenWatches[screen.id];

    if (isWatching) {
        if (discordCard) discordCard.classList.add('hidden');
        if (vid) {
            vid.muted = true;
            vid.playsInline = true;
            vid.autoplay = true;
            if (vid.srcObject !== screen.stream) {
                vid.srcObject = screen.stream;
            }
            if (vid.paused) {
                vid.play().catch(() => { });
            }
        }
    } else {
        if (discordCard) discordCard.classList.remove('hidden');
        if (vid) vid.srcObject = null;
    }
}

// ==========================================
// 6. BOTTOM BAR & CHAT LOGIC
// ==========================================
function updateBottomBarControls() {
    const btnMic = document.getElementById('btnToggleMic');
    const btnCam = document.getElementById('btnToggleCam');
    const btnScreen = document.getElementById('btnToggleScreen');
    const btnHand = document.getElementById('btnToggleHand');

    if (btnMic) {
        if (state.isMicOn) {
            btnMic.classList.remove('off');
            btnMic.innerHTML = '<i data-lucide="mic" style="width: 20px; height: 20px;"></i>';
        } else {
            btnMic.classList.add('off');
            btnMic.innerHTML = '<i data-lucide="mic-off" style="width: 20px; height: 20px;"></i>';
        }
    }

    if (btnCam) {
        if (state.isCamOn) {
            btnCam.classList.remove('off');
            btnCam.innerHTML = '<i data-lucide="video" style="width: 20px; height: 20px;"></i>';
        } else {
            btnCam.classList.add('off');
            btnCam.innerHTML = '<i data-lucide="video-off" style="width: 20px; height: 20px;"></i>';
        }
    }

    if (btnScreen) {
        if (state.isScreenSharing) btnScreen.classList.add('active');
        else btnScreen.classList.remove('active');
    }

    if (btnHand) {
        if (state.isHandRaised) btnHand.classList.add('active-yellow');
        else btnHand.classList.remove('active-yellow');
    }

    if (window.lucide) window.lucide.createIcons();
}

function openChatSidebar() {
    const chatDrawer = document.getElementById('chatDrawer');
    state.isChatOpen = true;
    chatDrawer?.classList.remove('hidden');
    document.getElementById('chatUnreadDot')?.classList.add('hidden');
    state.unreadCount = 0;
    // Re-render grid so left pane layout adapts to narrower space
    setTimeout(renderConferenceGrid, 50);
}

function closeChatSidebar() {
    const chatDrawer = document.getElementById('chatDrawer');
    state.isChatOpen = false;
    chatDrawer?.classList.add('hidden');
    setTimeout(renderConferenceGrid, 50);
}

function appendChatMessage(sender, text, isMe) {
    const list = document.getElementById('chatMessagesList');
    if (!list) return;
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${isMe ? 'me' : 'other'}`;
    msgEl.innerHTML = `
    <div class="chat-msg-author">${sender}</div>
    <div class="chat-msg-bubble">${text}</div>
  `;
    list.appendChild(msgEl);
    list.scrollTop = list.scrollHeight;
}

function spawnReaction(emoji) {
    const layer = document.getElementById('reactionsLayer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'p2p-float-item';
    el.style.left = (Math.random() * 60 + 20) + '%';
    el.textContent = emoji;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2200);
}

// ==========================================
// 7. MODALS & SETTINGS CONTROLLER
// ==========================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    if (id === 'modalSettings') updateAdminSettingsView();
    if (window.lucide) window.lucide.createIcons();
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function updateAdminSettingsView() {
    const statusMsg = document.getElementById('adminStatusMsg');
    const adminBlock = document.getElementById('adminControlsBlock');
    const peerList = document.getElementById('adminPeerList');
    const peerCount = document.getElementById('adminPeerCount');

    if (state.isAdmin) {
        if (statusMsg) statusMsg.textContent = 'Вы являетесь администратором комнаты';
        if (adminBlock) {
            adminBlock.style.opacity = '1';
            adminBlock.style.pointerEvents = 'auto';
        }
    } else {
        if (statusMsg) statusMsg.textContent = `Участник (Хост: ${state.hostName || 'Host'})`;
        if (adminBlock) {
            adminBlock.style.opacity = '0.5';
            adminBlock.style.pointerEvents = 'none';
        }
    }

    const allPeers = Object.values(state.peers);
    if (peerCount) peerCount.textContent = allPeers.length + 1;

    if (peerList) {
        peerList.innerHTML = `
      <div class="participant-row">
        <span><strong>${state.myName}</strong> (Вы${state.isAdmin ? ' · хост' : ''})</span>
      </div>
      ${allPeers.map(p => `
        <div class="participant-row">
          <span>${p.name}${state.hostId === p.id ? ' · хост' : ''}</span>
          ${state.isAdmin ? `<button type="button" class="studio-btn-danger btn-kick-user" data-peer="${p.id}">Исключить</button>` : ''}
        </div>
      `).join('')}
    `;

        peerList.querySelectorAll('.btn-kick-user').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-peer');
                if (confirm("Исключить участника?")) {
                    net.kickPeer(id);
                    updateAdminSettingsView();
                }
            };
        });
    }
}

function openTileDropdown(x, y, peerId, tileId) {
    const menu = document.getElementById('tileDropdownMenu');
    if (!menu) return;
    state.activeDropdownPeerId = peerId;
    menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
    menu.classList.remove('hidden');

    const kickBtn = document.getElementById('ddKickBtn');
    if (kickBtn) {
        if (state.isAdmin) kickBtn.classList.remove('hidden');
        else kickBtn.classList.add('hidden');
    }
}

document.addEventListener('click', () => {
    const dd = document.getElementById('tileDropdownMenu');
    if (dd) dd.classList.add('hidden');
});

// ==========================================
// 8. ATTACH ALL UI EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const hash = window.location.hash.substring(1).trim();
    if (hash.length >= 3) {
        const codeInp = document.getElementById('lobbyInputCode');
        if (codeInp) codeInp.value = P2PNet.cleanCode(hash);
    }
    await initLobbyPreview();
    if (window.lucide) window.lucide.createIcons();

    // Clock
    setInterval(() => {
        const clock = document.getElementById('meetClock');
        if (clock) {
            const d = new Date();
            clock.textContent = d.toTimeString().split(' ')[0].substring(0, 5);
        }
    }, 1000);

    // ResizeObserver with Debounce on the Left Pane container
    let resizeTimer = null;
    if (confLeftPane) {
        new ResizeObserver(() => {
            if (state.roomId) {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    renderConferenceGrid();
                }, 50);
            }
        }).observe(confLeftPane);
    }

    // Lobby Toggles
    document.getElementById('lobbyToggleMic')?.addEventListener('click', async () => {
        state.isMicOn = !state.isMicOn;
        if (state.localStream) {
            state.localStream.getAudioTracks().forEach(t => { t.enabled = state.isMicOn; });
        }
        updateLobbyButtons();
    });

    document.getElementById('lobbyToggleCam')?.addEventListener('click', async () => {
        state.isCamOn = !state.isCamOn;
        if (state.localStream) {
            state.localStream.getVideoTracks().forEach(t => { t.enabled = state.isCamOn; });
        }
        updateLobbyButtons();
    });

    document.getElementById('lobbyFlipCam')?.addEventListener('click', async () => {
        state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
        await initLobbyPreview();
    });

    // Create / Join Room
    document.getElementById('btnCreateRoom')?.addEventListener('click', async () => {
        unlockAudioEngine();
        const name = document.getElementById('lobbyInputName')?.value.trim() || 'Host';
        state.myName = name;
        try {
            const code = await net.createRoom(null, name, state.isMicOn, state.isCamOn);
            enterRoomUI(code);
        } catch (e) {
            alert(e.message || "Ошибка создания комнаты");
        }
    });

    document.getElementById('btnJoinRoom')?.addEventListener('click', async () => {
        unlockAudioEngine();
        const code = P2PNet.cleanCode(document.getElementById('lobbyInputCode')?.value);
        if (code.length < 3) return alert("Введите код комнаты");
        const name = document.getElementById('lobbyInputName')?.value.trim() || 'Guest';
        state.myName = name;
        enterRoomUI(code);
        try {
            await net.joinRoom(code, { name, isMicOn: state.isMicOn, isCamOn: state.isCamOn });
        } catch (e) {
            alert(e.message || "Не удалось войти");
            leaveCallUI();
        }
    });

    // Conference Bottom Bar Controls
    document.getElementById('btnToggleMic')?.addEventListener('click', async () => {
        soundFx.click();
        state.isMicOn = !state.isMicOn;
        net.currentMicOn = state.isMicOn;

        const stream = state.localStream || new MediaStream();
        const oldTrack = stream.getAudioTracks()[0];

        if (state.isMicOn) {
            try {
                const fresh = await navigator.mediaDevices.getUserMedia({
                    audio: state.selectedAudioDeviceId ? { deviceId: { exact: state.selectedAudioDeviceId } } : true,
                    video: false
                });
                const newTrack = fresh.getAudioTracks()[0];
                if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
                stream.addTrack(newTrack);
                await net.replaceTrack(newTrack, 'audio');
                localVAD.start(stream, true);
            } catch (e) {
                toast.error("Не удалось включить микрофон");
            }
        } else {
            const silent = createSilentAudioTrack();
            if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
            stream.addTrack(silent);
            await net.replaceTrack(silent, 'audio');
            localVAD.stop();
        }

        net.broadcast({ type: 'MIC_STATUS', isMicOn: state.isMicOn });
        updateBottomBarControls();
        renderConferenceGrid();
    });

    document.getElementById('btnToggleCam')?.addEventListener('click', async () => {
        soundFx.click();
        state.isCamOn = !state.isCamOn;
        net.currentCamOn = state.isCamOn;

        const stream = state.localStream || new MediaStream();
        const oldTrack = stream.getVideoTracks()[0];

        if (state.isCamOn) {
            try {
                const deviceId = state.selectedVideoDeviceId || await pickCameraDeviceId(state.currentFacingMode);
                const fresh = await navigator.mediaDevices.getUserMedia({
                    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: state.currentFacingMode },
                    audio: false
                });
                const newTrack = fresh.getVideoTracks()[0];
                if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
                stream.addTrack(newTrack);
                await net.replaceTrack(newTrack, 'video');
            } catch (e) {
                toast.error("Не удалось включить камеру");
            }
        } else {
            const black = createBlackVideoTrack();
            if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
            stream.addTrack(black);
            await net.replaceTrack(black, 'video');
        }

        net.broadcast({ type: 'CAM_STATUS', isCamOn: state.isCamOn });
        updateBottomBarControls();
        renderConferenceGrid();
    });

    document.getElementById('btnFlipCam')?.addEventListener('click', async () => {
        soundFx.click();
        state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
        if (state.isCamOn) {
            const deviceId = await pickCameraDeviceId(state.currentFacingMode);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: state.currentFacingMode },
                audio: false
            });
            const track = stream.getVideoTracks()[0];
            const old = state.localStream.getVideoTracks()[0];
            if (old) { state.localStream.removeTrack(old); old.stop(); }
            state.localStream.addTrack(track);
            await net.replaceTrack(track, 'video');
        }
        renderConferenceGrid();
    });

    // Screen Sharing (Sharer sees screen immediately & broadcasts)
    document.getElementById('btnToggleScreen')?.addEventListener('click', async () => {
        if (!state.allowScreenShare && !state.isAdmin) {
            return toast.error("Организатор отключил показ экрана");
        }
        if (state.isScreenSharing) {
            net.stopScreenShare();
            state.isScreenSharing = false;
            state.localScreenStream = null;
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                state.isScreenSharing = true;
                state.localScreenStream = stream;
                net.startScreenShare(stream, state.myName);
                stream.getVideoTracks()[0].onended = () => {
                    net.stopScreenShare();
                    state.isScreenSharing = false;
                    state.localScreenStream = null;
                    renderConferenceGrid();
                    updateBottomBarControls();
                };
            } catch (err) {
                if (err.name !== 'NotAllowedError') toast.error("Ошибка захвата экрана");
            }
        }
        updateBottomBarControls();
        renderConferenceGrid();
    });

    document.getElementById('btnToggleHand')?.addEventListener('click', () => {
        state.isHandRaised = !state.isHandRaised;
        net.broadcast({ type: 'HAND_RAISE', peerId: net.peer?.id, isRaised: state.isHandRaised, name: state.myName });
        updateBottomBarControls();
        renderConferenceGrid();
    });

    // Reactions Popover (Multi-Click)
    document.getElementById('btnOpenReactions')?.addEventListener('click', () => {
        document.getElementById('reactionsPopover')?.classList.toggle('hidden');
    });

    document.getElementById('btnCloseReactions')?.addEventListener('click', () => {
        document.getElementById('reactionsPopover')?.classList.add('hidden');
    });

    document.querySelectorAll('.reaction-item-btn').forEach(btn => {
        btn.onclick = () => {
            const emoji = btn.getAttribute('data-emoji');
            spawnReaction(emoji);
            net.broadcast({ type: 'REACTION', emoji });
        };
    });

    document.getElementById('btnCollapseBar')?.addEventListener('click', () => {
        document.getElementById('meetBottomBar')?.classList.add('hidden');
        document.getElementById('btnExpandBar')?.classList.remove('hidden');
        document.getElementById('conferenceScreen')?.classList.add('bar-collapsed');
    });

    document.getElementById('btnExpandBar')?.addEventListener('click', () => {
        document.getElementById('btnExpandBar')?.classList.add('hidden');
        document.getElementById('meetBottomBar')?.classList.remove('hidden');
        document.getElementById('conferenceScreen')?.classList.remove('bar-collapsed');
    });

    document.getElementById('btnLeaveCall')?.addEventListener('click', () => {
        soundFx.leave();
        net.destroy(true);
        leaveCallUI();
    });

    // Chat Drawer Toggles
    document.getElementById('btnToggleChat')?.addEventListener('click', () => {
        if (state.isChatOpen) closeChatSidebar();
        else openChatSidebar();
    });

    document.getElementById('btnCloseChat')?.addEventListener('click', closeChatSidebar);

    const sendChat = () => {
        const inp = document.getElementById('chatInputText');
        const text = inp?.value.trim();
        if (!text) return;
        soundFx.chat();
        appendChatMessage('Вы', text, true);
        net.broadcast({ type: 'CHAT_MSG', name: state.myName, text });
        if (inp) inp.value = '';
    };

    document.getElementById('btnSendChat')?.addEventListener('click', sendChat);
    document.getElementById('chatInputText')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

    // Mobile Bottom Sheet Buttons Binding (All 100% Functional)
    document.getElementById('mSheetHand')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        document.getElementById('btnToggleHand')?.click();
    });

    document.getElementById('mSheetScreen')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        document.getElementById('btnToggleScreen')?.click();
    });

    document.getElementById('mSheetFlipCam')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        document.getElementById('btnFlipCam')?.click();
    });

    document.getElementById('mSheetAudit')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        openModal('modalAudit');
    });

    document.getElementById('mSheetChat')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        openChatSidebar();
    });

    document.getElementById('mSheetInvite')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        openInviteModal();
    });

    document.getElementById('mSheetSettings')?.addEventListener('click', () => {
        closeModal('sheetMobile');
        openModal('modalSettings');
    });

    // Modals Open & Close
    document.getElementById('btnOpenSettings')?.addEventListener('click', () => openModal('modalSettings'));
    document.getElementById('btnOpenAudit')?.addEventListener('click', () => openModal('modalAudit'));
    document.getElementById('btnOpenInviteInfo')?.addEventListener('click', () => openInviteModal());
    document.getElementById('btnCopyRoomHeader')?.addEventListener('click', () => copyInviteLink());
    document.getElementById('btnOpenMobileSheet')?.addEventListener('click', () => openModal('sheetMobile'));

    document.querySelectorAll('.btnCloseModal').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.p2p-modal-backdrop').forEach(m => m.classList.add('hidden'));
        };
    });

    // Vertical Settings Tabs
    document.querySelectorAll('.settings-v-tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.settings-v-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
            if (tab === 'devices') document.getElementById('tabDevices')?.classList.remove('hidden');
            if (tab === 'ui') document.getElementById('tabUi')?.classList.remove('hidden');
            if (tab === 'admin') document.getElementById('tabAdmin')?.classList.remove('hidden');
        };
    });

    // Device list and application in settings
    const selectVid = document.getElementById('selectVideoDevice');
    const selectAud = document.getElementById('selectAudioDevice');
    if (selectVid && selectAud) {
        listRealVideoDevices().then(devs => {
            selectVid.innerHTML = devs.map(d => `<option value="${d.deviceId}">${d.label || 'Камера'}</option>`).join('');
        });
        listRealAudioDevices().then(devs => {
            selectAud.innerHTML = devs.map(d => `<option value="${d.deviceId}">${d.label || 'Микрофон'}</option>`).join('');
        });
    }

    document.getElementById('btnApplyDevices')?.addEventListener('click', async () => {
        state.selectedVideoDeviceId = selectVid.value;
        state.selectedAudioDeviceId = selectAud.value;

        if (state.isCamOn && state.selectedVideoDeviceId) {
            const fresh = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: state.selectedVideoDeviceId } }, audio: false
            });
            const track = fresh.getVideoTracks()[0];
            const old = state.localStream.getVideoTracks()[0];
            if (old) { state.localStream.removeTrack(old); old.stop(); }
            state.localStream.addTrack(track);
            await net.replaceTrack(track, 'video');
        }

        if (state.isMicOn && state.selectedAudioDeviceId) {
            const fresh = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: state.selectedAudioDeviceId } }, video: false
            });
            const track = fresh.getAudioTracks()[0];
            const old = state.localStream.getAudioTracks()[0];
            if (old) { state.localStream.removeTrack(old); old.stop(); }
            state.localStream.addTrack(track);
            await net.replaceTrack(track, 'audio');
        }

        toast.success("Оборудование успешно обновлено");
        renderConferenceGrid();
    });

    // UI settings bindings
    document.getElementById('switchMirrorCam')?.addEventListener('change', (e) => {
        state.isMirrored = e.target.checked;
        renderConferenceGrid();
    });

    document.getElementById('switchSoundFx')?.addEventListener('change', (e) => {
        soundFx.enabled = e.target.checked;
    });

    document.getElementById('switchChatToasts')?.addEventListener('change', (e) => {
        state.showChatToasts = e.target.checked;
    });

    document.getElementById('rangeSoundVol')?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        soundFx.volume = val;
        document.getElementById('labelSoundVol').textContent = `Громкость звуков (${Math.round(val * 100)}%)`;
    });

    // Admin controls bindings
    document.getElementById('switchLockRoom')?.addEventListener('change', (e) => {
        state.isLocked = e.target.checked;
        net.setRoomLocked(state.isLocked);
    });

    document.getElementById('switchAllowScreen')?.addEventListener('change', (e) => {
        state.allowScreenShare = e.target.checked;
        net.setScreenShareAllowed(state.allowScreenShare);
    });

    // Audit Logs
    const auditTerminal = document.getElementById('auditLogTerminal');
    if (auditTerminal) {
        P2PAuditLog.subscribe((logs) => {
            auditTerminal.innerHTML = logs.map(l => `
        <div class="log-line">
          <span class="log-time">[${l.time}]</span>
          <span class="log-tag log-tag-${l.category}">${l.category}</span>
          <span>${l.message} <span style="color: #9ca3af;">${l.extra}</span></span>
        </div>
      `).join('');
            auditTerminal.scrollTop = auditTerminal.scrollHeight;
        });
    }

    document.getElementById('btnCopyLogs')?.addEventListener('click', () => {
        navigator.clipboard.writeText(P2PAuditLog.exportText());
        toast.success("Логи скопированы");
    });

    document.getElementById('btnClearLogs')?.addEventListener('click', () => {
        P2PAuditLog.clear();
    });
});

// ==========================================
// 9. UI TRANSITION & HELPER METHODS
// ==========================================
function enterRoomUI(code) {
    state.roomId = code;
    window.location.hash = `#${code}`;
    document.getElementById('lobbyScreen')?.classList.add('hidden');
    document.getElementById('conferenceScreen')?.classList.remove('hidden');

    const stText = document.getElementById('headerStatusText');
    if (stText) stText.textContent = `ROOM: ${code}`;
    const stBadge = document.getElementById('headerStatusBadge');
    if (stBadge) stBadge.className = 'studio-badge online';
    const rmCodeText = document.getElementById('meetRoomCodeText');
    if (rmCodeText) rmCodeText.textContent = code;

    updateBottomBarControls();
    renderConferenceGrid();
}

function leaveCallUI() {
    state.roomId = null;
    window.location.hash = '';
    document.getElementById('appRoot')?.classList.remove('app-fullscreen-mode');
    document.getElementById('conferenceScreen')?.classList.add('hidden');
    document.getElementById('lobbyScreen')?.classList.remove('hidden');

    const stText = document.getElementById('headerStatusText');
    if (stText) stText.textContent = 'STANDBY';
    const stBadge = document.getElementById('headerStatusBadge');
    if (stBadge) stBadge.className = 'studio-badge';

    if (confGrid) confGrid.innerHTML = '';
}

function openInviteModal() {
    const codeDisp = document.getElementById('inviteCodeDisplay');
    if (codeDisp) codeDisp.textContent = state.roomId;
    const qrWrap = document.getElementById('inviteQrContainer');
    if (qrWrap && window.QRCode) {
        qrWrap.innerHTML = '';
        const url = net.getShareUrl();
        new window.QRCode(qrWrap, { text: url, width: 148, height: 148 });
    }
    openModal('modalInvite');
}

function copyInviteLink() {
    navigator.clipboard.writeText(net.getShareUrl());
    toast.success("Ссылка скопирована");
}

// ==========================================
// 10. BIND NET EVENTS TO UI (RESILIENT PLAYBACK)
// ==========================================
net.on('status', ({ online, reconnecting }) => {
    const badge = document.getElementById('headerStatusBadge');
    const text = document.getElementById('headerStatusText');
    if (!badge || !text) return;
    if (reconnecting) {
        badge.className = 'studio-badge reconnecting';
        text.textContent = 'RECONNECTING';
    } else if (online) {
        badge.className = 'studio-badge online';
        text.textContent = state.roomId ? `ROOM: ${state.roomId}` : 'ONLINE';
    } else {
        badge.className = 'studio-badge';
        text.textContent = 'STANDBY';
    }
});

net.on('room-created', ({ roomId, isHost }) => {
    state.isAdmin = isHost;
    updateAdminSettingsView();
});

net.on('remote-stream', ({ peerId, stream, metadata }) => {
    // Listen for track recovery on background tab switch
    stream.getTracks().forEach(track => {
        track.onunmute = () => {
            renderConferenceGrid();
        };
    });

    if (metadata?.type === 'screen') {
        state.screenStreams[peerId] = { id: peerId, name: metadata.name || 'Участник', stream };
    } else {
        state.peers[peerId] = {
            ...state.peers[peerId],
            id: peerId,
            name: metadata?.name || state.peers[peerId]?.name || 'Участник',
            isMicOn: metadata?.isMicOn ?? true,
            isCamOn: metadata?.isCamOn ?? true,
            stream
        };
    }
    renderConferenceGrid();
});

net.on('peer-connected', ({ peerId, name }) => {
    soundFx.join();
    state.peers[peerId] = state.peers[peerId] || {
        id: peerId,
        name: name || 'Участник',
        isMicOn: true,
        isCamOn: true,
        isHandRaised: false,
        isSpeaking: false,
        stream: null
    };
    renderConferenceGrid();
    updateAdminSettingsView();
});

net.on('peer-disconnected', ({ peerId }) => {
    soundFx.leave();
    delete state.peers[peerId];
    delete state.screenStreams[peerId];
    delete state.activeScreenWatches[peerId];
    renderConferenceGrid();
    updateAdminSettingsView();
});

net.on('host-changed', ({ isHost, hostName, hostId }) => {
    state.isAdmin = isHost;
    state.hostName = hostName;
    state.hostId = hostId;
    renderConferenceGrid();
    updateAdminSettingsView();
});

net.on('kicked', () => {
    soundFx.kick();
    alert("Вы были исключены организатором встречи.");
    leaveCallUI();
});

net.on('data', (data, senderId) => {
    if (data.type === 'CHAT_MSG') {
        soundFx.chat();
        appendChatMessage(data.name, data.text, false);
        if (!state.isChatOpen) {
            state.unreadCount++;
            document.getElementById('chatUnreadDot')?.classList.remove('hidden');
            if (state.showChatToasts) {
                toast.show(data.name, data.text);
            }
        }
    } else if (data.type === 'REACTION') {
        soundFx.reaction();
        spawnReaction(data.emoji);
    } else if (data.type === 'HAND_RAISE') {
        const pId = data.peerId || senderId;
        if (state.peers[pId]) state.peers[pId].isHandRaised = data.isRaised;
        if (data.isRaised) soundFx.hand();
        renderConferenceGrid();
    } else if (data.type === 'VAD_ACTIVITY') {
        const pId = data.peerId || senderId;
        if (state.peers[pId]) state.peers[pId].isSpeaking = data.isSpeaking;
        renderConferenceGrid();
    } else if (data.type === 'MIC_STATUS') {
        if (state.peers[senderId]) state.peers[senderId].isMicOn = data.isMicOn;
        renderConferenceGrid();
    } else if (data.type === 'CAM_STATUS') {
        if (state.peers[senderId]) state.peers[senderId].isCamOn = data.isCamOn;
        renderConferenceGrid();
    } else if (data.type === 'SCREEN_STOPPED') {
        delete state.screenStreams[senderId];
        delete state.activeScreenWatches[senderId];
        renderConferenceGrid();
    } else if (data.type === 'FORCE_STOP_SCREEN') {
        if (state.isScreenSharing) {
            net.stopScreenShare();
            state.isScreenSharing = false;
            state.localScreenStream = null;
            renderConferenceGrid();
            updateBottomBarControls();
            toast.error("Ваш показ экрана был остановлен администратором");
        }
    } else if (data.type === 'SCREEN_PERM_CHANGED') {
        state.allowScreenShare = data.allowed;
        if (!data.allowed && state.isScreenSharing && !state.isAdmin) {
            net.stopScreenShare();
            state.isScreenSharing = false;
            state.localScreenStream = null;
            renderConferenceGrid();
            updateBottomBarControls();
            toast.error("Администратор запретил показ экрана");
        }
    }
});