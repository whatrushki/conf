import React, { useState, useEffect, useRef } from 'react';
import { net } from '../lib/p2p-net';
import { unlockAudioEngine } from '../lib/audio';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Sparkles, Mic, MicOff, Video, VideoOff, SwitchCamera, VideoIcon } from 'lucide-react';

interface LobbyProps {
  onJoin: (roomId: string) => void;
  myName: string;
  setMyName: (name: string) => void;
  isMicOn: boolean;
  setIsMicOn: (on: boolean) => void;
  isCamOn: boolean;
  setIsCamOn: (on: boolean) => void;
  currentFacingMode: 'user' | 'environment';
  setCurrentFacingMode: (mode: 'user' | 'environment') => void;
  isMirrored: boolean;
  localStream: MediaStream | null;
  setLocalStream: (stream: MediaStream | null) => void;
}

export function Lobby({
  onJoin,
  myName,
  setMyName,
  isMicOn,
  setIsMicOn,
  isCamOn,
  setIsCamOn,
  currentFacingMode,
  setCurrentFacingMode,
  isMirrored,
  localStream,
  setLocalStream
}: LobbyProps) {
  const [roomCode, setRoomCode] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let active = true;
    const initPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (!active) return;
        setLocalStream(stream);
        net.localStream = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error('Camera error', e);
        setIsCamOn(false);
        setIsMicOn(false);
      }
    };
    initPreview();
    return () => { active = false; };
  }, [currentFacingMode, setLocalStream, setIsCamOn, setIsMicOn]);

  useEffect(() => {
    if (localStream) {
      const vTrack = localStream.getVideoTracks()[0];
      if (vTrack) vTrack.enabled = isCamOn;
      const aTrack = localStream.getAudioTracks()[0];
      if (aTrack) aTrack.enabled = isMicOn;
    }
  }, [localStream, isCamOn, isMicOn]);

  const handleFlip = async () => {
    const nextMode = currentFacingMode === 'user' ? 'environment' : 'user';
    setCurrentFacingMode(nextMode);
    // Stream re-init handles by useEffect
  };

  const createRoom = async () => {
    unlockAudioEngine();
    try {
      const code = await net.createRoom(null, myName, isMicOn, isCamOn);
      onJoin(code);
    } catch (e) {
      alert("Error creating room");
    }
  };

  const joinRoom = () => {
    if (roomCode.length < 3) return alert("Enter code");
    unlockAudioEngine();
    net.joinRoom(roomCode, { name: myName, isMicOn, isCamOn }).then(() => {
      onJoin(roomCode);
    }).catch((e: any) => alert(e.message));
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <div className="lobby-preview-pane">
          <div className={`video-tile ${isMirrored && currentFacingMode === 'user' ? 'mirrored' : ''}`}>
            {isCamOn ? (
              <video ref={videoRef} autoPlay playsInline muted />
            ) : (
              <div className="tile-avatar">
                <span className="material-symbols-outlined">person</span>
              </div>
            )}
          </div>
          <div className="preview-controls">
            <Button variant="secondary" onClick={() => setIsMicOn(!isMicOn)}>
              {isMicOn ? <Mic size={18} /> : <MicOff size={18} />} {isMicOn ? 'Mic' : 'Off'}
            </Button>
            <Button variant="secondary" onClick={() => setIsCamOn(!isCamOn)}>
              {isCamOn ? <Video size={18} /> : <VideoOff size={18} />} {isCamOn ? 'Cam' : 'Off'}
            </Button>
            <Button variant="secondary" size="icon" onClick={handleFlip}>
              <SwitchCamera size={18} />
            </Button>
          </div>
        </div>
        
        <div className="lobby-settings-pane">
          <div className="input-group">
            <label className="studio-label">NAME / CALLSIGN</label>
            <Input 
              value={myName} 
              onChange={e => setMyName(e.target.value)} 
              placeholder="Your name..." 
              maxLength={18}
            />
          </div>
          
          <Button onClick={createRoom} className="studio-btn-primary h-auto py-2.5">
            <VideoIcon size={18} /> Создать встречу
          </Button>

          <div className="divider-text">
            <span>ИЛИ ВХОД ПО КОДУ</span>
          </div>

          <div className="join-row">
            <Input 
              value={roomCode} 
              onChange={e => setRoomCode(e.target.value.toUpperCase())} 
              placeholder="КОД" 
              maxLength={6}
              className="input-room-code flex-1"
            />
            <Button onClick={joinRoom} variant="secondary">Войти</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
