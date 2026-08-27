import React, { useEffect, useRef, useState } from 'react';
import { PeerStatus, ScreenStatus } from '../hooks/useConference';
import { net } from '../lib/p2p-net';
import { avatarColorForId } from '../lib/utils';
import { isPlaceholderTrack } from '../lib/mediaPlaceholders';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Slider } from "./ui/slider";
import { Mic, MicOff, MoreVertical, Pin, Maximize, Trash2, Crown, StopCircle, EyeOff } from 'lucide-react';

interface VideoTileProps {
  peer: PeerStatus;
  isLocal: boolean;
  isMirrored?: boolean;
  isPinned: boolean;
  onPin: () => void;
  isAdmin: boolean;
  hostId: string | null;
  setVolume?: (peerId: string, vol: number) => void;
  onKick?: (peerId: string) => void;
}

export function VideoTile({ peer, isLocal, isMirrored, isPinned, onPin, isAdmin, hostId, setVolume, onKick }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(peer.volume);
  const avatarBg = avatarColorForId(peer.id || peer.name);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream, peer.isCamOn]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volumeLevel;
      if (setVolume) setVolume(peer.id, volumeLevel);
    }
  }, [volumeLevel]);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  const isHost = hostId === peer.id || (isLocal && net.isHost);
  const liveVideo = peer.stream?.getVideoTracks().find(t => t.readyState === 'live' && !isPlaceholderTrack(t));
  const showVideo = !!peer.isCamOn && !!liveVideo;

  return (
    <div className={`video-tile ${isMirrored ? 'mirrored' : ''} ${peer.isSpeaking ? 'speaking' : ''} ${isPinned ? 'is-stage' : ''} ${isFullscreen ? 'pseudo-fullscreen' : ''}`}>
      {showVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      ) : (
        <div className="tile-avatar" style={{ background: avatarBg, borderColor: 'transparent' }}>
          <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.92)' }}>person</span>
        </div>
      )}

      <div className="tile-hover-controls">
        <button className="tile-ctrl-btn" onClick={onPin} title={isPinned ? "Открепить" : "Закрепить"}>
          <Pin size={16} />
        </button>
        <button className="tile-ctrl-btn" onClick={toggleFullscreen} title="На весь экран">
          <Maximize size={16} />
        </button>
        
        {!isLocal && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="tile-ctrl-btn">
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-background border-border text-foreground">
              <div className="p-2 border-b border-border flex flex-col gap-2">
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>ГРОМКОСТЬ</span>
                  <span>{Math.round(volumeLevel * 100)}%</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[volumeLevel]}
                  onValueChange={(v) => setVolumeLevel(v[0])}
                />
              </div>
              <DropdownMenuItem onClick={onPin} className="text-xs cursor-pointer">
                <Pin size={14} className="mr-2" /> {isPinned ? 'Открепить' : 'Закрепить'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleFullscreen} className="text-xs cursor-pointer">
                <Maximize size={14} className="mr-2" /> Во весь экран
              </DropdownMenuItem>
              {isAdmin && onKick && (
                <DropdownMenuItem onClick={() => onKick(peer.id)} className="text-xs text-destructive cursor-pointer focus:text-destructive">
                  <Trash2 size={14} className="mr-2" /> Исключить
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="tile-overlay">
        <div className="tile-top-actions">
          {peer.isHandRaised && <div className="hand-badge">✋ Рука</div>}
        </div>
        <div className="tile-tag">
          {peer.isMicOn ? <Mic size={14} className="text-green-400" /> : <MicOff size={14} className="text-red-400" />}
          <span>{peer.name}</span>
          {isHost && <Crown size={14} className="text-yellow-400" title="Организатор" />}
        </div>
      </div>
    </div>
  );
}

interface ScreenTileProps {
  screen: ScreenStatus;
  isLocal: boolean;
  isPinned: boolean;
  onPin: () => void;
  isAdmin: boolean;
  onStopAdmin?: (peerId: string) => void;
  onPlay?: (peerId: string) => void;
}

export function ScreenTile({ screen, isLocal, isPinned, onPin, isAdmin, onStopAdmin, onPlay }: ScreenTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(isLocal);

  useEffect(() => {
    if (videoRef.current && screen.stream && hasStarted) {
      videoRef.current.srcObject = screen.stream;
      videoRef.current.play().catch(() => {});
    }
    if (videoRef.current && !hasStarted) {
      videoRef.current.srcObject = null;
    }
  }, [screen.stream, hasStarted]);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  const startStream = () => {
    setHasStarted(true);
    if (onPlay) onPlay(screen.id);
  };

  const stopWatching = () => {
    setHasStarted(false);
    setIsFullscreen(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }
  };

  return (
    <div className={`video-tile screen-tile ${isPinned ? 'is-stage' : ''} ${isFullscreen ? 'pseudo-fullscreen' : ''}`}>
      {hasStarted && (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      )}

      {!hasStarted && (
        <div className="stream-discord-card">
          <div className="stream-discord-icon">
            <span className="material-symbols-outlined">desktop_windows</span>
          </div>
          <div className="stream-discord-title">Трансляция экрана</div>
          <div className="stream-discord-desc">{screen.name} делится экраном</div>
          <Button onClick={startStream} size="sm" className="mt-2">
            Смотреть стрим
          </Button>
        </div>
      )}

      <div className="tile-hover-controls">
        <button className="tile-ctrl-btn" onClick={onPin}>
          <Pin size={16} />
        </button>
        {hasStarted && (
          <button className="tile-ctrl-btn" onClick={toggleFullscreen}>
            <Maximize size={16} />
          </button>
        )}
        {!isLocal && hasStarted && (
          <button className="tile-ctrl-btn" onClick={stopWatching} title="Скрыть стрим">
            <EyeOff size={16} />
          </button>
        )}
        {!isLocal && isAdmin && (
           <DropdownMenu>
           <DropdownMenuTrigger asChild>
             <button className="tile-ctrl-btn">
               <MoreVertical size={16} />
             </button>
           </DropdownMenuTrigger>
           <DropdownMenuContent className="w-48">
             {hasStarted && (
               <DropdownMenuItem onClick={stopWatching} className="text-xs cursor-pointer">
                 <EyeOff size={14} className="mr-2" /> Скрыть стрим
               </DropdownMenuItem>
             )}
             <DropdownMenuItem onClick={() => onStopAdmin?.(screen.id)} className="text-destructive cursor-pointer">
               <StopCircle size={14} className="mr-2" /> Остановить показ
             </DropdownMenuItem>
           </DropdownMenuContent>
         </DropdownMenu>
        )}
      </div>

      <div className="tile-overlay">
        <div className="tile-top-actions"></div>
        <div className="tile-tag">
          <span className="material-symbols-outlined text-blue-400 text-sm">screen_share</span>
          <span>{screen.name}</span>
          {!isLocal && hasStarted && (
            <button type="button" className="stream-stop-watch-btn" onClick={stopWatching} title="Скрыть стрим">
              <EyeOff size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
