import React, { useState, useEffect, useRef } from 'react';
import { net, P2PNet } from '../lib/p2p-net';
import { unlockAudioEngine, localVAD } from '../lib/audio';
import { createBlackVideoTrack, createSilentAudioTrack, isPlaceholderTrack, pickCameraDeviceId } from '../lib/mediaPlaceholders';
import { Mic, MicOff, Video, VideoOff, SwitchCamera, VideoIcon } from 'lucide-react';

interface LobbyProps {
  onEnter: (roomId: string) => void;
  myName: string;
  setMyName: (name: string) => void;
  isMicOn: boolean;
  isCamOn: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  currentFacingMode: 'user' | 'environment';
  flipCamera: () => void;
  isMirrored: boolean;
  localStream: MediaStream | null;
  syncStream: (stream: MediaStream | null) => void;
  ensureShellStream: (base?: MediaStream | null) => MediaStream;
  setIsMicOn: (on: boolean) => void;
  setIsCamOn: (on: boolean) => void;
}

export function Lobby({
  onEnter,
  myName,
  setMyName,
  isMicOn,
  isCamOn,
  toggleMic,
  toggleCam,
  currentFacingMode,
  flipCamera,
  isMirrored,
  localStream,
  syncStream,
  ensureShellStream,
  setIsMicOn,
  setIsCamOn
}: LobbyProps) {
  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const initDone = useRef(false);

  useEffect(() => {
    const hash = window.location.hash.substring(1).trim();
    if (hash.length >= 3) {
      setRoomCode(P2PNet.cleanCode(hash));
    }
  }, []);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    let active = true;

    const initPreview = async () => {
      try {
        const deviceId = await pickCameraDeviceId('user');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        // гарантируем оба трека
        if (!stream.getAudioTracks().length) stream.addTrack(createSilentAudioTrack());
        if (!stream.getVideoTracks().length) stream.addTrack(createBlackVideoTrack());
        syncStream(stream);
        net.currentMicOn = true;
        net.currentCamOn = true;
        localVAD.start(stream, true);
      } catch (e) {
        console.error('Camera error', e);
        const shell = ensureShellStream(new MediaStream());
        setIsCamOn(false);
        setIsMicOn(false);
        net.currentCamOn = false;
        net.currentMicOn = false;
        syncStream(shell);
      }
    };
    initPreview();
    return () => { active = false; };
  }, [syncStream, setIsCamOn, setIsMicOn, ensureShellStream]);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, isCamOn]);

  const resolvedName = () => myName.trim() || (`User-${Math.floor(Math.random() * 900 + 100)}`);

  const prepareMedia = () => {
    ensureShellStream(net.localStream || localStream);
  };

  const createRoom = async () => {
    if (busy) return;
    setBusy(true);
    unlockAudioEngine();
    prepareMedia();
    try {
      const name = resolvedName();
      setMyName(name);
      const code = await net.createRoom(null, name, isMicOn, isCamOn);
      onEnter(code);
    } catch (e: any) {
      alert(e?.message || "Ошибка создания комнаты");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const code = P2PNet.cleanCode(roomCode);
    if (code.length < 3) return alert("Введите код");
    if (busy) return;
    setBusy(true);
    unlockAudioEngine();
    prepareMedia();
    const name = resolvedName();
    setMyName(name);
    onEnter(code);
    try {
      await net.joinRoom(code, { name, isMicOn, isCamOn });
    } catch (e: any) {
      alert(e?.message || "Не удалось войти");
      onEnter('');
    } finally {
      setBusy(false);
    }
  };

  const showPreview = isCamOn && localStream?.getVideoTracks().some(t => t.readyState === 'live' && !isPlaceholderTrack(t));

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <div className="lobby-preview-pane">
          <div className={`video-tile ${isMirrored && currentFacingMode === 'user' ? 'mirrored' : ''}`}>
            {showPreview ? (
              <video ref={videoRef} autoPlay playsInline muted />
            ) : (
              <div className="tile-avatar">
                <span className="material-symbols-outlined">person</span>
              </div>
            )}
          </div>
          <div className="preview-controls">
            <button type="button" className="studio-btn-secondary" onClick={toggleMic}>
              {isMicOn ? <Mic size={18} /> : <MicOff size={18} />} {isMicOn ? 'Mic' : 'Off'}
            </button>
            <button type="button" className="studio-btn-secondary" onClick={toggleCam}>
              {isCamOn ? <Video size={18} /> : <VideoOff size={18} />} {isCamOn ? 'Cam' : 'Off'}
            </button>
            <button type="button" className="studio-btn-secondary" onClick={flipCamera} title="Сменить камеру">
              <SwitchCamera size={18} />
            </button>
          </div>
        </div>

        <div className="lobby-settings-pane">
          <div className="input-group">
            <label className="studio-label">NAME / CALLSIGN</label>
            <input
              className="studio-input"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              placeholder="Ваше имя..."
              maxLength={18}
            />
          </div>

          <button type="button" className="studio-btn-primary" onClick={createRoom} disabled={busy}>
            <VideoIcon size={18} /> Создать встречу
          </button>

          <div className="divider-text">
            <span>ИЛИ ВХОД ПО КОДУ</span>
          </div>

          <div className="join-row">
            <input
              className="studio-input input-room-code"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="КОД"
              maxLength={6}
            />
            <button type="button" className="studio-btn-secondary" onClick={joinRoom} disabled={busy}>
              Войти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
