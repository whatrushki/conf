import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Mic, MicOff, Video, VideoOff, MonitorUp, Hand, MessageSquare, Info, PhoneOff, MoreVertical, Copy, SwitchCamera, Smile } from 'lucide-react';
import { net } from '../lib/p2p-net';
import { toast } from 'sonner';

interface BottomBarProps {
  roomId: string;
  isMicOn: boolean;
  toggleMic: () => void;
  isCamOn: boolean;
  toggleCam: () => void;
  isScreenSharing: boolean;
  toggleScreenShare: () => void;
  isHandRaised: boolean;
  toggleHandRaise: () => void;
  onFlipCam: () => void;
  onToggleChat: () => void;
  onToggleReactions: () => void;
  onLeave: () => void;
  onInfo: () => void;
  unreadCount: number;
  openMobileSheet: () => void;
}

export function BottomBar({
  roomId, isMicOn, toggleMic, isCamOn, toggleCam, isScreenSharing, toggleScreenShare,
  isHandRaised, toggleHandRaise, onFlipCam, onToggleChat, onToggleReactions,
  onLeave, onInfo, unreadCount, openMobileSheet
}: BottomBarProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toTimeString().split(' ')[0].substring(0, 5));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const copyRoomLink = () => {
    const url = roomId ? `${window.location.href.split('#')[0]}#${roomId}` : net.getShareUrl();
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  return (
    <div className="meet-bar-wrapper">
      <footer className="meet-bottom-bar">
        {/* Left */}
        <div className="meet-bar-left hide-mobile">
          <div className="meet-time-pill">{time}</div>
          <div className="meet-room-pill" onClick={copyRoomLink} title="Копировать код">
            <span>{roomId}</span>
            <Copy size={14} />
          </div>
        </div>

        {/* Center */}
        <div className="meet-bar-center">
          <button className={`meet-btn ${!isMicOn ? 'off' : ''}`} onClick={toggleMic} title="Микрофон">
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          
          <button className={`meet-btn ${!isCamOn ? 'off' : ''}`} onClick={toggleCam} title="Камера">
            {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          
          <button className="meet-btn hide-mobile" onClick={onFlipCam} title="Сменить камеру">
            <SwitchCamera size={20} />
          </button>
          
          <button className={`meet-btn hide-mobile ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title="Поделиться экраном">
            <MonitorUp size={20} />
          </button>
          
          <button className={`meet-btn hide-mobile ${isHandRaised ? 'active-yellow' : ''}`} onClick={toggleHandRaise} title="Поднять руку">
            <Hand size={20} />
          </button>
          
          <button className="meet-btn" onClick={onToggleReactions} title="Реакции">
            <Smile size={20} />
          </button>
          
          {/* Mobile More Actions */}
          <button className="meet-btn show-mobile-only" onClick={openMobileSheet} title="Ещё">
            <MoreVertical size={20} />
          </button>
          
          <button className="meet-btn meet-btn-danger" onClick={onLeave} title="Завершить звонок">
            <PhoneOff size={20} />
          </button>
        </div>

        {/* Right */}
        <div className="meet-bar-right hide-mobile">
          <button className="meet-btn" onClick={onInfo} title="Информация о встрече">
            <Info size={20} />
          </button>
          <button className="meet-btn relative" onClick={onToggleChat} title="Чат">
            <MessageSquare size={20} />
            {unreadCount > 0 && <span className="chat-unread-dot" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
