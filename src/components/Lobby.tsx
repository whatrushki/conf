import React, { useState, useEffect, useRef } from 'react';
import { net, P2PNet } from '../lib/p2p-net';
import { unlockAudioEngine, localVAD } from '../lib/audio';
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        syncStream(stream);
        localVAD.start(stream, true);
      } catch (e) {
        console.error('Camera error', e);
        setIsCamOn(false);
        setIsMicOn(false);
      }
    };
    initPreview();
    return () => { active = false; };
  }, [syncStream, setIsCamOn, setIsMicOn]);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, isCamOn]);

  const resolvedName = () => myName.trim() || (`User-${Math.floor(Math.random() * 900 + 100)}`);

  const createRoom = async () => {
    if (busy) return;
    setBusy(true);
    unlockAudioEngine();
    try {
      const name = resolvedName();
      setMyName(name);
      const code = await net.createRoom(null, name, isMicOn, isCamOn);
      onEnter(code);
    } catch (e) {
      alert("Ошибка создания комнаты");
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
    const name = resolvedName();
    setMyName(name);
    // Сразу уходим в конференцию (как в оригинале prepareJoin)
    onEnter(code);
    try {
      await net.joinRoom(code, { name, isMicOn, isCamOn });
    } catch (e: any) {
      alert(e?.message || "Не удалось войти");
      onEnter(''); // leave — parent should clear; use null via callback
      // parent expects string — App will handle empty as leave
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <div className="lobby-preview-pane">
          <div className={`video-tile ${isMirrored && currentFacingMode === 'user' ? 'mirrored' : ''}`}>
            {isCamOn && localStream?.getVideoTracks().some(t => t.readyState === 'live') ? (
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
