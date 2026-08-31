/**
 * WHAT CONF - P2P Network Engine (PeerJS Mesh + Web Audio + VAD)
 */

// ==========================================
// 1. AUDIT LOGGER
// ==========================================
class AuditLogger {
    constructor() {
        this.logs = [];
        this.listeners = new Set();
    }

    add(category, message, extra = null) {
        const time = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
        const extraStr = extra ? (typeof extra === 'object' ? JSON.stringify(extra) : String(extra)) : '';
        this.logs.push({ time, category, message, extra: extraStr });
        if (this.logs.length > 700) this.logs.shift();
        this.notify();
    }

    exportText() {
        return this.logs.map(l => `[${l.time}] [${l.category}] ${l.message} ${l.extra}`).join('\n');
    }

    clear() {
        this.logs = [];
        this.notify();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(l => l(this.logs));
    }
}

export const P2PAuditLog = new AuditLogger();

// ==========================================
// 2. SOUND SYNTHESIZER (Web Audio API)
// ==========================================
export class SoundSynthesizer {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.5;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(freq, duration, type = 'sine', gainVal = 0.3) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(gainVal * this.volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) { }
    }

    join() {
        this.playTone(523.25, 0.12, 'sine', 0.25);
        setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.25), 90);
        setTimeout(() => this.playTone(783.99, 0.25, 'sine', 0.3), 180);
    }

    leave() {
        this.playTone(659.25, 0.12, 'sine', 0.2);
        setTimeout(() => this.playTone(440.0, 0.2, 'sine', 0.2), 100);
    }

    chat() {
        this.playTone(880, 0.08, 'triangle', 0.2);
        setTimeout(() => this.playTone(1174.66, 0.12, 'sine', 0.25), 50);
    }

    hand() {
        this.playTone(1046.5, 0.3, 'sine', 0.35);
    }

    reaction() {
        this.playTone(587.33, 0.1, 'sine', 0.15);
    }

    click() {
        this.playTone(400, 0.04, 'square', 0.05);
    }

    kick() {
        this.playTone(300, 0.2, 'sawtooth', 0.3);
        setTimeout(() => this.playTone(200, 0.3, 'sawtooth', 0.3), 130);
    }
}

export const soundFx = new SoundSynthesizer();

// ==========================================
// 3. VOICE ACTIVITY DETECTION (VAD)
// ==========================================
export class LocalVoiceDetector {
    constructor() {
        this.ctx = null;
        this.source = null;
        this.analyser = null;
        this.animFrame = null;
        this.isSpeaking = false;
        this.silenceTimer = null;
        this.onSpeakingChange = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    start(stream, isMicOn) {
        this.stop();
        if (!stream || stream.getAudioTracks().length === 0) return;
        this.init();
        if (!this.ctx) return;

        try {
            this.source = this.ctx.createMediaStreamSource(stream);
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.4;
            this.source.connect(this.analyser);

            const data = new Uint8Array(this.analyser.frequencyBinCount);

            const loop = () => {
                if (!isMicOn) {
                    if (this.isSpeaking) this._setSpeaking(false);
                    this.animFrame = requestAnimationFrame(loop);
                    return;
                }

                if (!this.analyser) return;
                this.analyser.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length;

                if (avg > 14) {
                    if (!this.isSpeaking) this._setSpeaking(true);
                    if (this.silenceTimer) clearTimeout(this.silenceTimer);
                    this.silenceTimer = setTimeout(() => this._setSpeaking(false), 350);
                }
                this.animFrame = requestAnimationFrame(loop);
            };
            loop();
        } catch (e) {
            console.warn('VAD Error', e);
        }
    }

    _setSpeaking(state) {
        this.isSpeaking = state;
        if (this.onSpeakingChange) this.onSpeakingChange(state);
    }

    stop() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.source) {
            try { this.source.disconnect(); } catch (e) { }
            this.source = null;
        }
        this._setSpeaking(false);
    }
}

export const localVAD = new LocalVoiceDetector();

export function unlockAudioEngine() {
    soundFx.init();
    localVAD.init();
}

// ==========================================
// 4. MEDIA PLACEHOLDERS & HELPERS
// ==========================================
let silentCtx = null;

export function createSilentAudioTrack() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!silentCtx || silentCtx.state === 'closed') {
        silentCtx = new AudioCtx();
    }
    if (silentCtx.state === 'suspended') {
        silentCtx.resume().catch(() => { });
    }
    const oscillator = silentCtx.createOscillator();
    const gain = silentCtx.createGain();
    gain.gain.value = 0;
    const dest = silentCtx.createMediaStreamDestination();
    oscillator.connect(gain);
    gain.connect(dest);
    oscillator.start();
    const track = dest.stream.getAudioTracks()[0];
    const origStop = track.stop.bind(track);
    track.stop = () => {
        try { oscillator.stop(); } catch { }
        try { oscillator.disconnect(); } catch { }
        try { gain.disconnect(); } catch { }
        origStop();
    };
    track.__placeholder = true;
    return track;
}

export function createBlackVideoTrack(width = 640, height = 480) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, width, height);

    const stream = canvas.captureStream(5);
    const track = stream.getVideoTracks()[0];

    let raf = 0;
    const draw = () => {
        ctx.fillStyle = '#111113';
        ctx.fillRect(0, 0, width, height);
        raf = requestAnimationFrame(draw);
    };
    draw();

    const origStop = track.stop.bind(track);
    track.stop = () => {
        cancelAnimationFrame(raf);
        origStop();
    };
    track.__placeholder = true;
    return track;
}

export function isPlaceholderTrack(track) {
    return !!(track && track.__placeholder);
}

export async function listRealVideoDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === 'videoinput' && d.deviceId);
    const byGroup = new Map();
    for (const d of videos) {
        const key = d.groupId || d.deviceId;
        const existing = byGroup.get(key);
        if (!existing || (!existing.label && d.label)) {
            byGroup.set(key, d);
        }
    }
    return Array.from(byGroup.values());
}

export async function listRealAudioDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audios = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
    const byGroup = new Map();
    for (const d of audios) {
        const key = d.groupId || d.deviceId;
        const existing = byGroup.get(key);
        if (!existing || (!existing.label && d.label)) {
            byGroup.set(key, d);
        }
    }
    return Array.from(byGroup.values());
}

export async function pickCameraDeviceId(facing) {
    const list = await listRealVideoDevices();
    if (!list.length) return null;

    const scored = list.map(d => {
        const label = (d.label || '').toLowerCase();
        let score = 0;
        if (facing === 'environment') {
            if (/back|rear|environment|тыл|задн|world/i.test(label)) score += 10;
            if (/front|user|face|перед|фронт/i.test(label)) score -= 5;
        } else {
            if (/front|user|face|перед|фронт/i.test(label)) score += 10;
            if (/back|rear|environment|тыл|задн|world/i.test(label)) score -= 5;
        }
        return { d, score };
    }).sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) return scored[0].d.deviceId;

    for (const { d } of scored.slice(0, 2)) {
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: d.deviceId } },
                audio: false
            });
            const t = s.getVideoTracks()[0];
            const caps = t.getCapabilities ? t.getCapabilities() : {};
            const modes = caps.facingMode || [];
            s.getTracks().forEach(x => x.stop());
            if (modes.includes(facing)) return d.deviceId;
        } catch { }
    }

    if (facing === 'environment' && list.length > 1) return list[list.length - 1].deviceId;
    return list[0].deviceId;
}

// ==========================================
// 5. P2PNET WEBRTC MESH CONTROLLER
// ==========================================
export class P2PNet {
    static ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    static HEARTBEAT_INTERVAL = 3000;
    static WATCHDOG_INTERVAL = 4000;

    static DEFAULT_ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    static PEER_SERVERS = [
        { host: '0.peerjs.com', port: 443, path: '/', secure: true }
    ];

    constructor(options = {}) {
        this.appPrefix = options.appPrefix || 'dropconf';
        this.mode = options.mode || 'mesh';
        this.iceServers = options.iceServers || P2PNet.DEFAULT_ICE_SERVERS;
        this.peerServerIndex = 0;

        this.peer = null;
        this.roomId = null;
        this.isHost = false;
        this.hostId = null;
        this.hostName = '';
        this.isDestroyed = false;
        this.userName = 'User';

        this.isLocked = false;
        this.allowScreenShare = true;

        this.initialMicState = true;
        this.initialCamState = true;
        this.currentMicOn = true;
        this.currentCamOn = true;

        this.peers = new Map();
        this.localStream = null;
        this.screenStream = null;
        this.screenCalls = new Map();
        this._events = {};

        this._heartbeatTimer = null;
        this._watchdogTimer = null;
        this._reconnectAttempts = 0;
    }

    _peerServerOpts() {
        const s = P2PNet.PEER_SERVERS[this.peerServerIndex % P2PNet.PEER_SERVERS.length];
        return {
            host: s.host,
            port: s.port,
            path: s.path,
            secure: s.secure,
            pingInterval: 5000,
        };
    }

    on(event, handler) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(handler);
        return this;
    }

    off(event, handler) {
        if (!this._events[event]) return;
        this._events[event] = this._events[event].filter(h => h !== handler);
    }

    emit(event, ...args) {
        if (this._events[event]) {
            this._events[event].forEach(h => {
                try { h(...args); } catch (e) { this._audit('ERR', `Event '${event}' error: ${e.message}`); }
            });
        }
    }

    _audit(category, message, extra = null) {
        P2PAuditLog.add(category, message, extra);
    }

    static generateCode(len = 5) {
        let res = "";
        for (let i = 0; i < len; i++) {
            res += P2PNet.ALPHABET.charAt(Math.floor(Math.random() * P2PNet.ALPHABET.length));
        }
        return res;
    }

    static cleanCode(str) {
        if (!str) return "";
        return str.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
    }

    async createRoom(customCode = null, myName = 'Host', isMicOn = true, isCamOn = true, maxRetries = 5) {
        this.isHost = true;
        this.userName = myName;
        this.initialMicState = isMicOn;
        this.initialCamState = isCamOn;
        this.currentMicOn = isMicOn;
        this.currentCamOn = isCamOn;
        let attempts = 0;
        let lastErr = null;

        while (attempts < maxRetries) {
            attempts++;
            const code = customCode || P2PNet.generateCode();
            const fullPeerId = `${this.appPrefix}-${code}`;
            const server = P2PNet.PEER_SERVERS[this.peerServerIndex % P2PNet.PEER_SERVERS.length];
            this._audit('SYS', `Создание комнаты (ID: ${fullPeerId}, попытка ${attempts}, signal: ${server.host})...`);

            try {
                await this._initPeer(fullPeerId);
                this.roomId = code;
                this.hostId = this.peer.id;
                this.hostName = this.userName;
                this._startHeartbeat();
                this._startWatchdog();
                this._audit('SYS', `Комната создана: ${this.roomId}`);
                this.emit('room-created', { roomId: this.roomId, isHost: true });
                return this.roomId;
            } catch (err) {
                lastErr = err;
                const errType = err?.type || err?.message || 'unknown';
                this._audit('WARN', `Не удалось открыть peer (${errType})`, server.host);
                if (errType === 'unavailable-id' && customCode) throw err;
                if (errType === 'network' || errType === 'server-error' || errType === 'socket-error') {
                    this.peerServerIndex++;
                    await new Promise(r => setTimeout(r, 400 + attempts * 300));
                    continue;
                }
                if (errType === 'unavailable-id' && !customCode) continue;
                throw err;
            }
        }
        throw lastErr || new Error("Не удалось создать комнату. Сигнальный сервер PeerJS недоступен.");
    }

    async joinRoom(code, myData = {}) {
        this.isHost = false;
        const cleaned = P2PNet.cleanCode(code);
        this.userName = myData.name || 'Guest';
        this.initialMicState = myData.isMicOn ?? true;
        this.initialCamState = myData.isCamOn ?? true;
        this.currentMicOn = this.initialMicState;
        this.currentCamOn = this.initialCamState;
        const hostPeerId = `${this.appPrefix}-${cleaned}`;

        let lastErr = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
            const server = P2PNet.PEER_SERVERS[this.peerServerIndex % P2PNet.PEER_SERVERS.length];
            this._audit('NET', `Подключение к сессии: ${hostPeerId} (попытка ${attempt}, signal: ${server.host})`);
            try {
                await this._initPeer();
                this.roomId = cleaned;
                this._startHeartbeat();
                this._startWatchdog();

                return await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        this._audit('ERR', `Таймаут подключения к комнате ${this.roomId}`);
                        reject(new Error("Таймаут подключения. Проверьте код комнаты."));
                    }, 14000);

                    this._connectToPeer(hostPeerId, {
                        onOpen: (conn) => {
                            clearTimeout(timer);
                            this._audit('NET', `DataChannel с хостом установлен. Отправка JOIN_REQ`);
                            conn.send({
                                __sys: 'JOIN_REQ',
                                peerId: this.peer.id,
                                name: this.userName,
                                isMicOn: this.initialMicState,
                                isCamOn: this.initialCamState,
                                ...myData
                            });
                            resolve(conn);
                        },
                        onError: (err) => {
                            clearTimeout(timer);
                            reject(err);
                        }
                    });
                });
            } catch (err) {
                lastErr = err;
                const errType = err?.type || err?.message || 'unknown';
                this._audit('WARN', `Join peer failed (${errType})`);
                if (errType === 'network' || errType === 'server-error' || errType === 'socket-error') {
                    this.peerServerIndex++;
                    await new Promise(r => setTimeout(r, 400 + attempt * 300));
                    continue;
                }
                throw err;
            }
        }
        throw lastErr || new Error("Не удалось подключиться. Сигнальный сервер PeerJS недоступен.");
    }

    _initPeer(fixedId = null) {
        return new Promise((resolve, reject) => {
            const savedRoomId = this.roomId;
            this.destroy(true);
            this.isDestroyed = false;
            this.roomId = savedRoomId;

            const serverOpts = this._peerServerOpts();
            this._audit('SYS', `Подключение к PeerJS signal: ${serverOpts.host}`);

            const config = {
                debug: 0,
                ...serverOpts,
                config: {
                    iceServers: this.iceServers,
                    iceTransportPolicy: 'all'
                }
            };

            // Global window.Peer loaded from CDN
            this.peer = fixedId ? new window.Peer(fixedId, config) : new window.Peer(config);

            let opened = false;
            this.peer.on('open', (id) => {
                opened = true;
                this._reconnectAttempts = 0;
                this._audit('SYS', `PeerJS Signaler готов, ID: ${id}`);
                this.emit('status', { online: true, id });
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this._audit('NET', `Входящий DataChannel от: ${conn.peer}`);
                this._handleIncomingConnection(conn);
            });

            this.peer.on('call', (call) => {
                this._audit('MEDIA', `Входящий Media Call от: ${call.peer}`, call.metadata);
                this._handleIncomingCall(call);
            });

            this.peer.on('disconnected', () => {
                this._audit('WARN', "Сигнальный сервер отключен. Авто-реконнект...");
                this.emit('status', { online: false, reconnecting: true });
                this._tryReconnect();
            });

            this.peer.on('error', (err) => {
                this._audit('ERR', `PeerJS Error: [${err.type}] ${err.message}`);
                this.emit('error', err);
                if (!opened) reject(err);
            });
        });
    }

    _tryReconnect() {
        if (this.isDestroyed || !this.peer) return;
        this._reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, this._reconnectAttempts), 8000);

        setTimeout(() => {
            if (!this.isDestroyed && this.peer && this.peer.disconnected) {
                this._audit('SYS', `Реконнект к сигнальному серверу (${this._reconnectAttempts})...`);
                try { this.peer.reconnect(); } catch (e) { }
            }
        }, delay);
    }

    _startWatchdog() {
        if (this._watchdogTimer) clearInterval(this._watchdogTimer);
        this._watchdogTimer = setInterval(() => {
            if (this.isDestroyed || !this.peer) return;

            this.peers.forEach((record, peerId) => {
                if (!record.call?.peerConnection) return;
                const pc = record.call.peerConnection;
                const iceState = pc.iceConnectionState;

                if (iceState === 'failed') {
                    this._audit('WARN', `ICE failed у ${peerId}. restartIce + repair`);
                    try { if (pc.restartIce) pc.restartIce(); } catch (e) { }
                    this.repairPeerMedia(peerId);
                } else if (iceState === 'disconnected') {
                    this._audit('WARN', `ICE disconnected у ${peerId}. restartIce`);
                    try { if (pc.restartIce) pc.restartIce(); } catch (e) { }
                }
            });
        }, P2PNet.WATCHDOG_INTERVAL);
    }

    repairPeerMedia(peerId) {
        if (!this.localStream || this.isDestroyed) return;
        const record = this.peers.get(peerId);
        if (!record) return;
        const pc = record.call?.peerConnection;
        const ice = pc?.iceConnectionState;
        if (ice && ice !== 'failed' && ice !== 'disconnected' && ice !== 'closed') {
            return;
        }
        this._audit('MEDIA', `Восстановление медиа-сессии с ${peerId} (ICE=${ice})`);
        if (record.call) {
            try { record.call.close(); } catch (e) { }
            record.call = null;
        }
        setTimeout(() => {
            this.call(peerId, this.localStream, {
                type: 'camera',
                name: this.userName,
                isMicOn: this.currentMicOn,
                isCamOn: this.currentCamOn
            });
        }, 400);
    }

    _startHeartbeat() {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = setInterval(() => {
            const now = Date.now();
            this.peers.forEach((record, peerId) => {
                if (record.conn && record.conn.open) {
                    record.conn.send({ __sys: 'PING', ts: now });
                }
                if (record.lastSeen && now - record.lastSeen > 20000) {
                    this._audit('WARN', `Таймаут пира ${peerId} (>20s).`);
                    this._cleanupPeer(peerId);
                }
            });
        }, P2PNet.HEARTBEAT_INTERVAL);
    }

    _connectToPeer(remotePeerId, callbacks = {}) {
        if (this.peers.has(remotePeerId)) {
            const existing = this.peers.get(remotePeerId);
            if (existing.conn && existing.conn.open) return existing.conn;
        }

        const conn = this.peer.connect(remotePeerId, { reliable: true });
        const peerRecord = this.peers.get(remotePeerId) || { conn, call: null, queue: [], isReady: false, name: '', lastSeen: Date.now() };
        peerRecord.conn = conn;
        this.peers.set(remotePeerId, peerRecord);

        conn.on('open', () => {
            peerRecord.isReady = true;
            peerRecord.lastSeen = Date.now();
            this._audit('NET', `Канал данных открыт: ${remotePeerId}`);
            while (peerRecord.queue.length > 0) {
                conn.send(peerRecord.queue.shift());
            }
            if (callbacks.onOpen) callbacks.onOpen(conn);
            this.emit('peer-connected', { peerId: remotePeerId, name: peerRecord.name, totalPeers: this.peers.size });
        });

        this._bindDataEvents(conn, peerRecord);
        return conn;
    }

    _handleIncomingConnection(conn) {
        const peerRecord = this.peers.get(conn.peer) || { conn, call: null, queue: [], isReady: false, name: '', lastSeen: Date.now() };
        peerRecord.conn = conn;
        this.peers.set(conn.peer, peerRecord);

        conn.on('open', () => {
            peerRecord.isReady = true;
            peerRecord.lastSeen = Date.now();
            this._audit('NET', `Канал данных подключен: ${conn.peer}`);
            this.emit('peer-connected', { peerId: conn.peer, name: peerRecord.name, totalPeers: this.peers.size });
        });

        this._bindDataEvents(conn, peerRecord);
    }

    _bindDataEvents(conn, peerRecord) {
        conn.on('data', (packet) => {
            if (!packet || typeof packet !== 'object') return;
            peerRecord.lastSeen = Date.now();

            if (packet.__sys) {
                this._handleSystemPacket(conn.peer, packet);
                return;
            }
            this.emit('data', packet, conn.peer);
        });

        conn.on('close', () => {
            this._audit('NET', `Канал закрыт: ${conn.peer}`);
            this._cleanupPeer(conn.peer);
        });
        conn.on('error', (e) => {
            this._audit('ERR', `Ошибка канала ${conn.peer}: ${e}`);
            this._cleanupPeer(conn.peer);
        });
    }

    _cleanupPeer(peerId) {
        if (this.peers.has(peerId)) {
            const p = this.peers.get(peerId);
            if (p.conn) try { p.conn.close(); } catch (e) { }
            if (p.call) try { p.call.close(); } catch (e) { }
            this.peers.delete(peerId);
        }
        if (this.screenCalls.has(peerId)) {
            const sc = this.screenCalls.get(peerId);
            try { sc.close(); } catch (e) { }
            this.screenCalls.delete(peerId);
        }

        this._audit('SYS', `Пир ${peerId} удален`);
        this.emit('peer-disconnected', { peerId, totalPeers: this.peers.size });

        if (peerId === this.hostId) {
            this._electNewHost();
        }
    }

    _electNewHost() {
        const allIds = [this.peer.id, ...Array.from(this.peers.keys())].sort();
        const nextHostId = allIds[0];

        if (nextHostId === this.peer.id) {
            this.isHost = true;
            this.hostId = this.peer.id;
            this.hostName = this.userName;
            this._audit('SYS', `👑 Права администратора перешли к вам!`);
            this.broadcast({ __sys: 'HOST_CHANGED', hostId: this.peer.id, hostName: this.userName });
            this.emit('host-changed', { isHost: true, hostName: this.userName, hostId: this.peer.id });
        } else {
            this.isHost = false;
            this.hostId = nextHostId;
            const hRecord = this.peers.get(nextHostId);
            this.hostName = hRecord ? hRecord.name : 'Admin';
            this._audit('SYS', `Новый администратор: ${this.hostName} (${nextHostId})`);
            this.emit('host-changed', { isHost: false, hostName: this.hostName, hostId: nextHostId });
        }
    }

    setRoomLocked(locked) {
        if (!this.isHost) return;
        this.isLocked = !!locked;
        this.broadcast({ __sys: 'ROOM_LOCK_STATUS', isLocked: this.isLocked });
    }

    setScreenShareAllowed(allowed) {
        if (!this.isHost) return;
        this.allowScreenShare = !!allowed;
        this.broadcast({ type: 'SCREEN_PERM_CHANGED', allowed: this.allowScreenShare });
    }

    kickPeer(targetPeerId) {
        if (!this.isHost || !this.peers.has(targetPeerId)) return;
        this._audit('SYS', `Исключение пира ${targetPeerId}`);
        this.send({ __sys: 'KICKED' }, targetPeerId);
        setTimeout(() => this._cleanupPeer(targetPeerId), 200);
    }

    _handleSystemPacket(senderPeerId, packet) {
        if (packet.__sys === 'PING') {
            this.send({ __sys: 'PONG', ts: packet.ts }, senderPeerId);
        } else if (packet.__sys === 'PONG') {
            // OK
        } else if (packet.__sys === 'JOIN_REQ') {
            const guestName = packet.name || 'Guest';

            if (this.isHost && this.isLocked) {
                this._audit('SYS', `Отказ входа для ${senderPeerId}: комната заблокирована`);
                this.send({ __sys: 'JOIN_REJECTED', reason: 'Комната заблокирована организатором.' }, senderPeerId);
                return;
            }

            this._audit('SYS', `Принят запрос от ${senderPeerId} (${guestName})`);
            let peerRecord = this.peers.get(senderPeerId);
            if (peerRecord) peerRecord.name = guestName;

            const members = Array.from(this.peers.keys()).map(id => ({
                peerId: id,
                name: this.peers.get(id)?.name || ''
            }));

            this.send({
                __sys: 'ROOM_MEMBERS',
                members,
                hostId: this.isHost ? this.peer.id : this.hostId,
                hostName: this.isHost ? this.userName : this.hostName,
                isLocked: this.isLocked,
                allowScreenShare: this.allowScreenShare
            }, senderPeerId);

            this.broadcast({
                __sys: 'NEW_PEER',
                peerId: senderPeerId,
                name: guestName,
                isMicOn: packet.isMicOn,
                isCamOn: packet.isCamOn
            }, [senderPeerId]);

            setTimeout(() => {
                if (this.localStream) {
                    this.call(senderPeerId, this.localStream, {
                        type: 'camera',
                        name: this.userName,
                        isMicOn: this.currentMicOn,
                        isCamOn: this.currentCamOn
                    });
                }
            }, 300);

            if (this.screenStream) {
                setTimeout(() => this.callScreen(senderPeerId, this.screenStream, this.userName), 600);
            }
        } else if (packet.__sys === 'ROOM_MEMBERS') {
            this.hostId = packet.hostId;
            this.hostName = packet.hostName || 'Host';
            this.isLocked = !!packet.isLocked;
            this.allowScreenShare = packet.allowScreenShare ?? true;

            this._audit('SYS', `Список участников от хоста (${this.hostName}):`, packet.members);
            this.emit('host-changed', { isHost: this.isHost, hostName: this.hostName, hostId: this.hostId });

            packet.members.forEach((m) => {
                if (m.peerId !== this.peer.id && !this.peers.has(m.peerId)) {
                    this._connectToPeer(m.peerId);
                    const pr = this.peers.get(m.peerId);
                    if (pr) pr.name = m.name;
                }
            });
        } else if (packet.__sys === 'NEW_PEER') {
            this._audit('SYS', `Новый участник в сети: ${packet.peerId} (${packet.name})`);
            if (packet.peerId !== this.peer.id && !this.peers.has(packet.peerId)) {
                this._connectToPeer(packet.peerId);
                const pr = this.peers.get(packet.peerId);
                if (pr) pr.name = packet.name;

                setTimeout(() => {
                    if (this.localStream) {
                        this.call(packet.peerId, this.localStream, {
                            type: 'camera',
                            name: this.userName,
                            isMicOn: this.currentMicOn,
                            isCamOn: this.currentCamOn
                        });
                    }
                }, 400);
            }
        } else if (packet.__sys === 'KICKED') {
            this.emit('kicked');
            this.destroy(true);
        } else if (packet.__sys === 'JOIN_REJECTED') {
            alert(packet.reason || "Вход отклонен.");
            this.destroy(true);
            window.location.reload();
        } else if (packet.__sys === 'HOST_CHANGED') {
            this.hostId = packet.hostId;
            this.hostName = packet.hostName;
            this.isHost = (this.peer.id === this.hostId);
            this.emit('host-changed', { isHost: this.isHost, hostName: this.hostName, hostId: this.hostId });
        } else if (packet.__sys === 'ROOM_LOCK_STATUS') {
            this.isLocked = packet.isLocked;
        }
    }

    send(data, targetPeerId = null) {
        const peerId = targetPeerId || Array.from(this.peers.keys())[0];
        if (!peerId) return false;
        const peerRecord = this.peers.get(peerId);
        if (!peerRecord) return false;

        if (peerRecord.isReady && peerRecord.conn?.open) {
            peerRecord.conn.send(data);
        } else {
            peerRecord.queue.push(data);
        }
        return true;
    }

    broadcast(data, excludePeerIds = []) {
        this.peers.forEach((_, peerId) => {
            if (!excludePeerIds.includes(peerId)) {
                this.send(data, peerId);
            }
        });
    }

    call(remotePeerId, stream, metadata = {}) {
        if (!this.peer || this.peer.destroyed) return;
        const mediaStream = stream || this.localStream;
        if (!mediaStream) return;

        const meta = { type: 'camera', name: this.userName, ...metadata };
        this._audit('MEDIA', `peer.call() -> ${remotePeerId}`, meta);
        const call = this.peer.call(remotePeerId, mediaStream, { metadata: meta });
        if (!call) return;

        let peerRecord = this.peers.get(remotePeerId);
        if (!peerRecord) {
            peerRecord = { conn: null, call, queue: [], isReady: false, name: '', lastSeen: Date.now() };
            this.peers.set(remotePeerId, peerRecord);
        } else {
            peerRecord.call = call;
        }

        this._setupCallEvents(call, remotePeerId, meta);
    }

    callScreen(remotePeerId, stream, senderName = '') {
        if (!this.peer || this.peer.destroyed || !stream) return;
        const meta = { type: 'screen', name: senderName || this.userName };
        const call = this.peer.call(remotePeerId, stream, { metadata: meta });
        if (call) {
            this.screenCalls.set(remotePeerId, call);
            this._setupCallEvents(call, remotePeerId, meta);
        }
    }

    _handleIncomingCall(call) {
        const meta = call.metadata || { type: 'camera', name: 'Участник' };
        this._audit('MEDIA', `Принят звонок от ${call.peer}`, meta);

        let peerRecord = this.peers.get(call.peer);
        if (!peerRecord) {
            peerRecord = { conn: null, call, queue: [], isReady: false, name: meta.name, lastSeen: Date.now() };
            this.peers.set(call.peer, peerRecord);
        } else {
            peerRecord.call = call;
            if (meta.name) peerRecord.name = meta.name;
        }

        if (meta.type === 'screen') {
            call.answer();
        } else {
            call.answer(this.localStream || undefined);
        }

        this._setupCallEvents(call, call.peer, meta);
    }

    _setupCallEvents(call, peerId, meta) {
        const cacheSenders = () => {
            const record = this.peers.get(peerId);
            const pc = call.peerConnection;
            if (!record || !pc) return;
            record.senders = record.senders || {};
            pc.getSenders().forEach((s) => {
                if (s.track?.kind === 'audio') record.senders.audio = s;
                if (s.track?.kind === 'video') record.senders.video = s;
            });
            const senders = pc.getSenders();
            if (!record.senders.audio && senders[0]) record.senders.audio = senders[0];
            if (!record.senders.video && senders[1]) record.senders.video = senders[1];
        };

        call.on('stream', (remoteStream) => {
            const vCount = remoteStream.getVideoTracks().length;
            const aCount = remoteStream.getAudioTracks().length;
            const peerName = this.peers.get(peerId)?.name || meta.name || 'Участник';

            this._audit('MEDIA', `Поток от ${peerId} (${peerName}) готов (Видео:${vCount}, Аудио:${aCount})`);
            cacheSenders();
            this.emit('remote-stream', {
                peerId,
                stream: remoteStream,
                metadata: {
                    ...meta,
                    name: peerName,
                    isMicOn: meta.isMicOn ?? true,
                    isCamOn: meta.isCamOn ?? true
                }
            });
        });

        call.on('close', () => {
            this._audit('MEDIA', `Медиа-сессия закрыта: ${peerId}`);
        });

        call.on('error', (err) => {
            this._audit('ERR', `Ошибка вызова (${peerId}): ${err.message}`);
        });

        if (call.peerConnection) {
            cacheSenders();
            setTimeout(cacheSenders, 400);
            call.peerConnection.oniceconnectionstatechange = () => {
                const state = call.peerConnection.iceConnectionState;
                this._audit('ICE', `ICE [${peerId}]: ${state}`);
                if (state === 'failed') {
                    try { call.peerConnection.restartIce(); } catch (e) { }
                }
            };
            call.peerConnection.onconnectionstatechange = () => {
                const st = call.peerConnection.connectionState;
                this._audit('ICE', `PC [${peerId}]: ${st}`);
            };
        }
    }

    async replaceTrack(newTrack, kind = 'video') {
        this._audit('MEDIA', `Замена трека [${kind}] на всех пирах...`);
        const promises = [];

        const findSender = (pc, peerRecord) => {
            if (!peerRecord.senders) peerRecord.senders = {};
            if (peerRecord.senders[kind]) {
                const cached = peerRecord.senders[kind];
                if (pc.getSenders().includes(cached)) return cached;
            }

            const senders = pc.getSenders();
            let target = senders.find((s) => s.track?.kind === kind);
            if (!target && pc.getTransceivers) {
                const trans = pc.getTransceivers().find((t) => {
                    if (t.sender?.track?.kind === kind) return true;
                    if (t.receiver?.track?.kind === kind) return true;
                    if (t.sender && !t.sender.track) {
                        const dir = t.direction;
                        if (dir !== 'sendrecv' && dir !== 'sendonly') return false;
                        const all = pc.getTransceivers().filter(x =>
                            x.direction === 'sendrecv' || x.direction === 'sendonly'
                        );
                        const idx = all.indexOf(t);
                        if (kind === 'audio' && idx === 0) return true;
                        if (kind === 'video' && idx >= 1) return true;
                        if (kind === 'video' && all.length === 1 && idx === 0) return true;
                    }
                    return false;
                });
                if (trans?.sender) target = trans.sender;
            }
            if (target) peerRecord.senders[kind] = target;
            return target || null;
        };

        this.peers.forEach((peerRecord, peerId) => {
            if (peerRecord.call && peerRecord.call.peerConnection) {
                const pc = peerRecord.call.peerConnection;
                const targetSender = findSender(pc, peerRecord);

                if (targetSender) {
                    promises.push(
                        targetSender.replaceTrack(newTrack).then(() => {
                            if (newTrack) peerRecord.senders[kind] = targetSender;
                        }).catch((e) => {
                            this._audit('ERR', `Ошибка replaceTrack у ${peerId}: ${e.message}`);
                        })
                    );
                } else if (newTrack && this.localStream) {
                    try {
                        const sender = pc.addTrack(newTrack, this.localStream);
                        if (!peerRecord.senders) peerRecord.senders = {};
                        peerRecord.senders[kind] = sender;
                        this._audit('MEDIA', `addTrack [${kind}] для ${peerId}`);
                    } catch (e) {
                        this._audit('ERR', `addTrack у ${peerId}: ${e.message}`);
                    }
                }
            }
        });
        await Promise.all(promises);
    }

    startScreenShare(stream, myName = '') {
        this.screenStream = stream;
        this.peers.forEach((_, peerId) => {
            this.callScreen(peerId, stream, myName || this.userName);
        });
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(t => t.stop());
            this.screenStream = null;
        }
        this.screenCalls.forEach(call => {
            try { call.close(); } catch (e) { }
        });
        this.screenCalls.clear();
        this.broadcast({ type: 'SCREEN_STOPPED', peerId: this.peer?.id });
    }

    getShareUrl() {
        if (!this.roomId) return window.location.href;
        return window.location.href.split('#')[0] + "#" + this.roomId;
    }

    destroy(keepStream = false) {
        this.isDestroyed = true;
        if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
        if (this._watchdogTimer) { clearInterval(this._watchdogTimer); this._watchdogTimer = null; }
        this.stopScreenShare();

        this.peers.forEach(p => {
            if (p.conn) try { p.conn.close(); } catch (e) { }
            if (p.call) try { p.call.close(); } catch (e) { }
        });
        this.peers.clear();

        if (!keepStream && this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }

        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) { }
            this.peer = null;
        }
        this.roomId = null;
        this._audit('SYS', 'P2PNet экземпляр завершен');
    }
}

export const net = new P2PNet({ appPrefix: 'dropconf', mode: 'mesh', debug: true });
