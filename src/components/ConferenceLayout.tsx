import React, { useState, useEffect } from 'react';
import { useConference } from '../hooks/useConference';
import { VideoTile, ScreenTile } from './VideoTile';
import { SidebarChat } from './SidebarChat';
import { BottomBar } from './BottomBar';
import { net } from '../lib/p2p-net';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from './ui/button';

export function ConferenceLayout({ conf }: { conf: ReturnType<typeof useConference> }) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const togglePin = (id: string) => {
    setPinnedId(prev => (prev === id ? null : id));
  };

  const handleToggleChat = () => {
    setIsChatOpen(prev => !prev);
    if (!isChatOpen) conf.setUnreadCount(0);
    setMobileSheetOpen(false);
  };

  // Reactions
  const EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '👏', '😮', '🤔'];
  const handleReaction = (emoji: string) => {
    conf.spawnReaction(emoji);
    net.broadcast({ type: 'REACTION', emoji });
    setShowReactions(false);
  };

  const gridCount = Object.keys(conf.peers).length + Object.keys(conf.screenStreams).length + (conf.isScreenSharing ? 1 : 0) + 1; // +1 for local cam
  
  let gridClass = 'count-many';
  if (pinnedId) {
    gridClass = 'has-stage';
  } else if (gridCount <= 1) {
    gridClass = 'count-1';
  } else if (gridCount === 2) {
    gridClass = 'count-2';
  } else if (gridCount <= 4) {
    gridClass = 'count-4';
  }

  const kickParticipant = (id: string) => {
    if (confirm("Исключить участника из встречи?")) {
      net.kickPeer(id);
      toast.success("Участник исключен");
    }
  };

  const toggleScreen = async () => {
    if (!conf.allowScreenShare && !net.isHost) {
      return toast.error("Администратор отключил показ экрана");
    }
    if (conf.isScreenSharing) {
      net.stopScreenShare();
      conf.setIsScreenSharing(false);
      if (pinnedId === 'local-screen') setPinnedId(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        conf.setIsScreenSharing(true);
        conf.setLocalScreenStream(stream);
        net.startScreenShare(stream, conf.myName);
        stream.getVideoTracks()[0].onended = () => {
          net.stopScreenShare();
          conf.setIsScreenSharing(false);
        };
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') toast.error("Ошибка экрана");
      }
    }
    setMobileSheetOpen(false);
  };

  return (
    <div className="conference-container">
      <div className="conf-main-area">
        <div className="conf-video-container">
          <div className={`conf-grid ${gridClass}`}>
            
            {/* Local Camera */}
            <VideoTile
              peer={{
                id: 'local',
                name: 'Вы',
                isMicOn: conf.isMicOn,
                isCamOn: conf.isCamOn,
                isHandRaised: conf.isHandRaised,
                isSpeaking: conf.isLocalSpeaking,
                stream: conf.localStream,
                volume: 1
              }}
              isLocal={true}
              isMirrored={conf.isMirrored && conf.currentFacingMode === 'user'}
              isPinned={pinnedId === 'local'}
              onPin={() => togglePin('local')}
              isAdmin={conf.isAdmin}
              hostId={conf.hostId}
            />

            {/* Local Screen Share */}
            {conf.isScreenSharing && conf.localScreenStream && (
              <ScreenTile
                screen={{
                  id: 'local-screen',
                  name: `${conf.myName} (Экран)`,
                  stream: conf.localScreenStream
                }}
                isLocal={true}
                isPinned={pinnedId === 'local-screen'}
                onPin={() => togglePin('local-screen')}
                isAdmin={conf.isAdmin}
              />
            )}

            {/* Remote Screen Shares */}
            {Object.values(conf.screenStreams).map(screen => (
              <ScreenTile
                key={`screen-${screen.id}`}
                screen={screen}
                isLocal={false}
                isPinned={pinnedId === `screen-${screen.id}`}
                onPin={() => togglePin(`screen-${screen.id}`)}
                isAdmin={conf.isAdmin}
                onStopAdmin={(id) => {
                  net.send({ type: 'FORCE_STOP_SCREEN' }, id);
                  toast.success("Демонстрация остановлена");
                }}
              />
            ))}

            {/* Remote Cameras */}
            {Object.values(conf.peers).map(peer => (
              <VideoTile
                key={peer.id}
                peer={peer}
                isLocal={false}
                isPinned={pinnedId === peer.id}
                onPin={() => togglePin(peer.id)}
                isAdmin={conf.isAdmin}
                hostId={conf.hostId}
                onKick={kickParticipant}
              />
            ))}
          </div>
          
          {/* Reactions popover */}
          {showReactions && (
            <div className="reactions-popover">
              {EMOJIS.map(e => (
                <button key={e} className="reaction-item-btn" onClick={() => handleReaction(e)}>{e}</button>
              ))}
              <button className="reaction-item-close" onClick={() => setShowReactions(false)}>
                <X size={16} />
              </button>
            </div>
          )}

          {/* Floating Reactions */}
          {conf.reactions.map(r => (
            <div key={r.id} className="p2p-float-item" style={{ left: r.left }}>{r.emoji}</div>
          ))}
        </div>

        <SidebarChat 
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(false)} 
          messages={conf.messages} 
          myName={conf.myName}
          setMessages={conf.setMessages}
        />
      </div>

      <BottomBar 
        roomId={conf.roomId || ''}
        isMicOn={conf.isMicOn} toggleMic={() => conf.setIsMicOn(!conf.isMicOn)}
        isCamOn={conf.isCamOn} toggleCam={() => conf.setIsCamOn(!conf.isCamOn)}
        isScreenSharing={conf.isScreenSharing} toggleScreenShare={toggleScreen}
        isHandRaised={conf.isHandRaised} toggleHandRaise={() => {
          conf.setIsHandRaised(!conf.isHandRaised);
          net.broadcast({ type: 'HAND_RAISE', peerId: net.peer?.id, isRaised: !conf.isHandRaised, name: conf.myName });
        }}
        onFlipCam={async () => {
          const next = conf.currentFacingMode === 'user' ? 'environment' : 'user';
          conf.setCurrentFacingMode(next);
        }}
        onToggleChat={handleToggleChat}
        onToggleReactions={() => setShowReactions(!showReactions)}
        onLeave={conf.leaveCall}
        onInfo={() => { /* Handle in App level Modal */ window.dispatchEvent(new Event('openInvite')) }}
        unreadCount={conf.unreadCount}
        openMobileSheet={() => setMobileSheetOpen(true)}
      />

      {/* Mobile Sheet */}
      {mobileSheetOpen && (
        <div className="p2p-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setMobileSheetOpen(false) }}>
          <div className="meet-bottom-sheet">
            <div className="sheet-drag-handle"></div>
            <div className="sheet-grid-actions">
              <Button variant="secondary" className="h-16 flex-col" onClick={() => {
                conf.setIsHandRaised(!conf.isHandRaised);
                net.broadcast({ type: 'HAND_RAISE', peerId: net.peer?.id, isRaised: !conf.isHandRaised, name: conf.myName });
                setMobileSheetOpen(false);
              }}>
                ✋ Рука
              </Button>
              <Button variant="secondary" className="h-16 flex-col" onClick={toggleScreen}>
                💻 Экран
              </Button>
              <Button variant="secondary" className="h-16 flex-col" onClick={() => {
                conf.setCurrentFacingMode(conf.currentFacingMode === 'user' ? 'environment' : 'user');
                setMobileSheetOpen(false);
              }}>
                📷 Смена
              </Button>
              <Button variant="secondary" className="h-16 flex-col text-yellow-400" onClick={() => {
                window.dispatchEvent(new Event('openAudit'));
                setMobileSheetOpen(false);
              }}>
                💻 Аудит
              </Button>
            </div>
            <div className="sheet-list-actions mt-4 flex flex-col gap-2">
              <Button variant="secondary" className="w-full justify-start h-12" onClick={handleToggleChat}>💬 Чат</Button>
              <Button variant="secondary" className="w-full justify-start h-12" onClick={() => { window.dispatchEvent(new Event('openInvite')); setMobileSheetOpen(false); }}>➕ Пригласить</Button>
              <Button variant="secondary" className="w-full justify-start h-12" onClick={() => { window.dispatchEvent(new Event('openSettings')); setMobileSheetOpen(false); }}>⚙️ Настройки</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
