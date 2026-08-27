import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useConference } from '../hooks/useConference';
import { VideoTile, ScreenTile } from './VideoTile';
import { SidebarChat } from './SidebarChat';
import { BottomBar } from './BottomBar';
import { net } from '../lib/p2p-net';
import { computeConferenceGrid } from '../lib/gridLayout';
import { toast } from 'sonner';
import { X, Hand, MonitorUp, SwitchCamera, TerminalSquare, MessageSquare, UserPlus, Settings } from 'lucide-react';

type ChatToast = { id: number; sender: string; text: string };

export function ConferenceLayout({ conf }: { conf: ReturnType<typeof useConference> }) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [chatToasts, setChatToasts] = useState<ChatToast[]>([]);
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );
  const [gridBox, setGridBox] = useState({ w: 0, h: 0 });
  const msgLenRef = useRef(0);
  const chatOpenRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  chatOpenRef.current = isChatOpen;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onMq = () => setIsMobile(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setGridBox({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const len = conf.messages.length;
    if (len > msgLenRef.current) {
      const newest = conf.messages.slice(msgLenRef.current);
      newest.forEach(msg => {
        if (msg.isMe) return;
        if (chatOpenRef.current) return;
        if (!conf.showChatToasts) return;
        const id = Date.now() + Math.random();
        setChatToasts(prev => [...prev.slice(-4), { id, sender: msg.sender, text: msg.text }]);
        setTimeout(() => {
          setChatToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
      });
    }
    msgLenRef.current = len;
  }, [conf.messages, conf.showChatToasts]);

  const togglePin = (id: string) => {
    setPinnedId(prev => (prev === id ? null : id));
  };

  const handleToggleChat = () => {
    setIsChatOpen(prev => {
      if (!prev) conf.setUnreadCount(0);
      return !prev;
    });
    setMobileSheetOpen(false);
  };

  const EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '👏', '😮', '🤔'];
  const handleReaction = (emoji: string) => {
    conf.spawnReaction(emoji);
    net.broadcast({ type: 'REACTION', emoji });
  };

  const gridCount =
    Object.keys(conf.peers).length +
    Object.keys(conf.screenStreams).length +
    (conf.isScreenSharing ? 1 : 0) +
    1;

  const layout = useMemo(
    () => computeConferenceGrid(gridCount, isMobile, gridBox.w, gridBox.h),
    [gridCount, isMobile, gridBox.w, gridBox.h]
  );

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
      conf.setLocalScreenStream(null);
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
          conf.setLocalScreenStream(null);
        };
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') toast.error("Ошибка экрана");
      }
    }
    setMobileSheetOpen(false);
  };

  const toggleHand = () => {
    const next = !conf.isHandRaised;
    conf.setIsHandRaised(next);
    net.broadcast({ type: 'HAND_RAISE', peerId: net.peer?.id, isRaised: next, name: conf.myName });
  };

  const gridStyle: React.CSSProperties | undefined = pinnedId
    ? undefined
    : {
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      };

  return (
    <div className={`conference-container ${barCollapsed ? 'bar-collapsed' : ''}`}>
      <div className={`conf-main-area ${isChatOpen ? 'chat-open' : ''}`}>
        <div className="conf-video-container">
          <div
            ref={gridRef}
            className={`conf-grid ${pinnedId ? 'has-stage' : ''} ${layout.stretchLast ? 'stretch-last' : ''}`}
            style={gridStyle}
          >
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

          <div className="chat-toast-container">
            {chatToasts.map(t => (
              <div key={t.id} className="chat-overlay-bubble" onClick={handleToggleChat}>
                <div className="chat-toast-author">{t.sender}</div>
                <div className="chat-toast-text">{t.text}</div>
              </div>
            ))}
          </div>

          {showReactions && (
            <div className="reactions-popover">
              {EMOJIS.map(e => (
                <button key={e} type="button" className="reaction-item-btn" onClick={() => handleReaction(e)}>{e}</button>
              ))}
              <button type="button" className="reaction-item-close" onClick={() => setShowReactions(false)}>
                <X size={16} />
              </button>
            </div>
          )}

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
        isMicOn={conf.isMicOn} toggleMic={conf.toggleMic}
        isCamOn={conf.isCamOn} toggleCam={conf.toggleCam}
        isScreenSharing={conf.isScreenSharing} toggleScreenShare={toggleScreen}
        isHandRaised={conf.isHandRaised} toggleHandRaise={toggleHand}
        onFlipCam={conf.flipCamera}
        onToggleChat={handleToggleChat}
        onToggleReactions={() => setShowReactions(v => !v)}
        onLeave={conf.leaveCall}
        onInfo={() => window.dispatchEvent(new Event('openInvite'))}
        unreadCount={conf.unreadCount}
        openMobileSheet={() => setMobileSheetOpen(true)}
        collapsed={barCollapsed}
        onToggleCollapse={() => setBarCollapsed(v => !v)}
      />

      {mobileSheetOpen && (
        <div className="p2p-modal-backdrop sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setMobileSheetOpen(false); }}>
          <div className="meet-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-drag-handle" />
            <div className="sheet-grid-actions">
              <button type="button" className={`sheet-tile-btn ${conf.isHandRaised ? 'active' : ''}`} onClick={() => { toggleHand(); setMobileSheetOpen(false); }}>
                <Hand size={22} /><span>Поднять руку</span>
              </button>
              <button type="button" className={`sheet-tile-btn ${conf.isScreenSharing ? 'active' : ''}`} onClick={toggleScreen}>
                <MonitorUp size={22} /><span>Экран</span>
              </button>
              <button type="button" className="sheet-tile-btn" onClick={() => { conf.flipCamera(); setMobileSheetOpen(false); }}>
                <SwitchCamera size={22} /><span>Сменить камеру</span>
              </button>
              <button type="button" className="sheet-tile-btn" onClick={() => { window.dispatchEvent(new Event('openAudit')); setMobileSheetOpen(false); }}>
                <TerminalSquare size={22} className="text-yellow-400" /><span>Аудит</span>
              </button>
            </div>
            <div className="sheet-list-actions">
              <button type="button" className="sheet-list-item" onClick={handleToggleChat}>
                <MessageSquare size={20} /><span>Сообщения встречи</span>
                {conf.unreadCount > 0 && <span className="sheet-badge">New</span>}
              </button>
              <button type="button" className="sheet-list-item" onClick={() => { window.dispatchEvent(new Event('openInvite')); setMobileSheetOpen(false); }}>
                <UserPlus size={20} /><span>Пригласить участников</span>
              </button>
              <button type="button" className="sheet-list-item" onClick={() => { window.dispatchEvent(new Event('openSettings')); setMobileSheetOpen(false); }}>
                <Settings size={20} /><span>Настройки</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
