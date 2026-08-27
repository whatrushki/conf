import { useState, useEffect, useCallback } from 'react';
import { net } from '../lib/p2p-net';
import { localVAD, soundFx } from '../lib/audio';

export type PeerStatus = {
  id: string;
  name: string;
  isMicOn: boolean;
  isCamOn: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
  stream: MediaStream | null;
  volume: number;
};

export type ScreenStatus = {
  id: string;
  name: string;
  stream: MediaStream | null;
};

export type ChatMessage = {
  sender: string;
  text: string;
  isMe: boolean;
  timestamp: number;
};

export type Reaction = {
  emoji: string;
  id: number;
  left: string;
};

export function useConference() {
  const [online, setOnline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  
  const [myName, setMyName] = useState("User");
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(true);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  
  const [peers, setPeers] = useState<Record<string, PeerStatus>>({});
  const [screenStreams, setScreenStreams] = useState<Record<string, ScreenStatus>>({});
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [isAdmin, setIsAdmin] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [hostName, setHostName] = useState('');
  
  const [isLocked, setIsLocked] = useState(false);
  const [allowScreenShare, setAllowScreenShare] = useState(true);

  // Sound settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [showChatToasts, setShowChatToasts] = useState(true);

  useEffect(() => {
    soundFx.enabled = soundEnabled;
    soundFx.volume = soundVolume;
  }, [soundEnabled, soundVolume]);

  useEffect(() => {
    const handleStatus = ({ online, reconnecting, id }: any) => {
      setOnline(online);
      setReconnecting(reconnecting);
      if (net.roomId) setRoomId(net.roomId);
    };

    const handleRoomCreated = ({ roomId, isHost }: any) => {
      setRoomId(roomId);
      setIsAdmin(isHost);
    };

    const handleRemoteStream = ({ peerId, stream, metadata }: any) => {
      if (metadata?.type === 'screen') {
        setScreenStreams(prev => ({
          ...prev,
          [peerId]: { id: peerId, name: metadata.name || 'Участник', stream }
        }));
      } else {
        setPeers(prev => ({
          ...prev,
          [peerId]: {
            ...prev[peerId],
            id: peerId,
            name: metadata?.name || 'Участник',
            isMicOn: metadata?.isMicOn ?? true,
            isCamOn: metadata?.isCamOn ?? true,
            stream,
            volume: prev[peerId]?.volume ?? 1.0,
            isSpeaking: false,
            isHandRaised: false
          }
        }));
      }
    };

    const handlePeerConnected = ({ peerId, name }: any) => {
      soundFx.join();
      setPeers(prev => ({
        ...prev,
        [peerId]: prev[peerId] || {
          id: peerId,
          name: name || 'Участник',
          isMicOn: true,
          isCamOn: true,
          isHandRaised: false,
          isSpeaking: false,
          stream: null,
          volume: 1.0
        }
      }));
    };

    const handlePeerDisconnected = ({ peerId }: any) => {
      soundFx.leave();
      setPeers(prev => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      setScreenStreams(prev => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    const handleHostChanged = ({ isHost, hostName, hostId }: any) => {
      setIsAdmin(isHost);
      setHostName(hostName);
      setHostId(hostId);
    };

    const handleKicked = () => {
      soundFx.kick();
      alert("Вы были исключены организатором встречи.");
      leaveCall();
    };

    const handleData = (data: any, senderId: string) => {
      if (data.type === 'CHAT_MSG') {
        soundFx.chat();
        setMessages(prev => [...prev, { sender: data.name, text: data.text, isMe: false, timestamp: Date.now() }]);
        setUnreadCount(c => c + 1);
      } else if (data.type === 'REACTION') {
        soundFx.reaction();
        spawnReaction(data.emoji);
      } else if (data.type === 'HAND_RAISE') {
        const targetId = data.peerId || senderId;
        setPeers(prev => prev[targetId] ? { ...prev, [targetId]: { ...prev[targetId], isHandRaised: data.isRaised } } : prev);
        if (data.isRaised) soundFx.hand();
      } else if (data.type === 'VAD_ACTIVITY') {
        const targetId = data.peerId || senderId;
        setPeers(prev => prev[targetId] ? { ...prev, [targetId]: { ...prev[targetId], isSpeaking: data.isSpeaking } } : prev);
      } else if (data.type === 'MIC_STATUS') {
        setPeers(prev => prev[senderId] ? { ...prev, [senderId]: { ...prev[senderId], isMicOn: data.isMicOn } } : prev);
      } else if (data.type === 'CAM_STATUS') {
        setPeers(prev => prev[senderId] ? { ...prev, [senderId]: { ...prev[senderId], isCamOn: data.isCamOn } } : prev);
      } else if (data.type === 'SCREEN_STOPPED') {
        setScreenStreams(prev => {
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      } else if (data.type === 'FORCE_STOP_SCREEN') {
        setIsScreenSharing(false);
      } else if (data.type === 'SCREEN_PERM_CHANGED') {
        setAllowScreenShare(data.allowed);
      }
    };

    net.on('status', handleStatus);
    net.on('room-created', handleRoomCreated);
    net.on('remote-stream', handleRemoteStream);
    net.on('peer-connected', handlePeerConnected);
    net.on('peer-disconnected', handlePeerDisconnected);
    net.on('host-changed', handleHostChanged);
    net.on('kicked', handleKicked);
    net.on('data', handleData);

    return () => {
      net.off('status', handleStatus);
      net.off('room-created', handleRoomCreated);
      net.off('remote-stream', handleRemoteStream);
      net.off('peer-connected', handlePeerConnected);
      net.off('peer-disconnected', handlePeerDisconnected);
      net.off('host-changed', handleHostChanged);
      net.off('kicked', handleKicked);
      net.off('data', handleData);
    };
  }, []);

  const spawnReaction = (emoji: string) => {
    const id = Date.now() + Math.random();
    const left = (Math.random() * 60 + 20) + '%';
    setReactions(prev => [...prev, { emoji, id, left }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2200);
  };

  const leaveCall = () => {
    soundFx.leave();
    net.destroy(true);
    setRoomId(null);
    setPeers({});
    setScreenStreams({});
    setIsScreenSharing(false);
    setIsAdmin(false);
  };

  return {
    // State
    online, reconnecting, roomId, myName, isMicOn, isCamOn, isScreenSharing, isHandRaised,
    currentFacingMode, isMirrored, localStream, localScreenStream, isLocalSpeaking,
    peers, screenStreams, messages, reactions, unreadCount,
    isAdmin, hostId, hostName, isLocked, allowScreenShare,
    soundEnabled, soundVolume, showChatToasts,
    
    // Setters
    setMyName, setIsMicOn, setIsCamOn, setIsScreenSharing, setIsHandRaised,
    setCurrentFacingMode, setIsMirrored, setLocalStream, setLocalScreenStream, setIsLocalSpeaking,
    setUnreadCount, setMessages, spawnReaction, setSoundEnabled, setSoundVolume, setShowChatToasts,
    setAllowScreenShare, setIsLocked,
    
    // Actions
    leaveCall
  };
}
