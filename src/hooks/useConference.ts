import { useState, useEffect, useCallback, useRef } from 'react';
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

async function getMedia(opts: MediaStreamConstraints) {
  return navigator.mediaDevices.getUserMedia(opts);
}

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

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [showChatToasts, setShowChatToasts] = useState(true);

  const isMicOnRef = useRef(isMicOn);
  const isCamOnRef = useRef(isCamOn);
  const facingRef = useRef(currentFacingMode);
  isMicOnRef.current = isMicOn;
  isCamOnRef.current = isCamOn;
  facingRef.current = currentFacingMode;

  useEffect(() => {
    soundFx.enabled = soundEnabled;
    soundFx.volume = soundVolume;
  }, [soundEnabled, soundVolume]);

  useEffect(() => {
    localVAD.onSpeakingChange = (speaking) => {
      setIsLocalSpeaking(speaking);
      if (net.peer?.id) {
        net.broadcast({ type: 'VAD_ACTIVITY', peerId: net.peer.id, isSpeaking: speaking });
      }
    };
    return () => { localVAD.onSpeakingChange = undefined; };
  }, []);

  const syncStream = useCallback((stream: MediaStream | null) => {
    net.localStream = stream;
    setLocalStream(stream);
  }, []);

  const stopTracksOfKind = useCallback((stream: MediaStream | null, kind: 'audio' | 'video') => {
    if (!stream) return;
    const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
    tracks.forEach(t => {
      try { stream.removeTrack(t); } catch { /* */ }
      try { t.stop(); } catch { /* */ }
    });
    // на всякий случай гасим «осиротевшие» треки того же kind на net.localStream
    const netStream = net.localStream;
    if (netStream && netStream !== stream) {
      const extra = kind === 'audio' ? netStream.getAudioTracks() : netStream.getVideoTracks();
      extra.forEach(t => {
        try { netStream.removeTrack(t); } catch { /* */ }
        try { t.stop(); } catch { /* */ }
      });
    }
  }, []);

  const rebuildStream = useCallback((base: MediaStream | null) => {
    const next = new MediaStream();
    (base?.getTracks() || []).forEach(t => {
      if (t.readyState === 'live') next.addTrack(t);
    });
    syncStream(next.getTracks().length ? next : null);
    return next.getTracks().length ? next : null;
  }, [syncStream]);

  const toggleMic = useCallback(async () => {
    soundFx.click();
    const stream = net.localStream || localStream;

    if (isMicOnRef.current) {
      stopTracksOfKind(stream, 'audio');
      localVAD.stop();
      await net.replaceTrack(null, 'audio');
      net.broadcast({ type: 'MIC_STATUS', isMicOn: false });
      setIsMicOn(false);
      rebuildStream(stream);
      return;
    }

    try {
      const fresh = await getMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      const track = fresh.getAudioTracks()[0];
      // остановить лишние треки из fresh
      fresh.getVideoTracks().forEach(t => t.stop());
      const next = stream && stream.getTracks().some(t => t.readyState === 'live')
        ? stream
        : new MediaStream();
      next.getAudioTracks().forEach(t => { next.removeTrack(t); t.stop(); });
      next.addTrack(track);
      syncStream(next);
      await net.replaceTrack(track, 'audio');
      localVAD.start(next, true);
      net.broadcast({ type: 'MIC_STATUS', isMicOn: true });
      setIsMicOn(true);
    } catch (e) {
      console.error(e);
      alert('Не удалось включить микрофон');
    }
  }, [localStream, stopTracksOfKind, syncStream, rebuildStream]);

  const toggleCam = useCallback(async () => {
    soundFx.click();
    const stream = net.localStream || localStream;

    if (isCamOnRef.current) {
      stopTracksOfKind(stream, 'video');
      await net.replaceTrack(null, 'video');
      net.broadcast({ type: 'CAM_STATUS', isCamOn: false });
      setIsCamOn(false);
      rebuildStream(stream);
      return;
    }

    try {
      const fresh = await getMedia({
        video: {
          facingMode: { ideal: facingRef.current },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      const track = fresh.getVideoTracks()[0];
      fresh.getAudioTracks().forEach(t => t.stop());
      const next = stream && stream.getTracks().some(t => t.readyState === 'live')
        ? stream
        : new MediaStream();
      next.getVideoTracks().forEach(t => { next.removeTrack(t); t.stop(); });
      next.addTrack(track);
      syncStream(next);
      await net.replaceTrack(track, 'video');
      net.broadcast({ type: 'CAM_STATUS', isCamOn: true });
      setIsCamOn(true);
    } catch (e) {
      console.error(e);
      alert('Не удалось включить камеру');
    }
  }, [localStream, stopTracksOfKind, syncStream, rebuildStream]);

  const flipCamera = useCallback(async () => {
    soundFx.click();
    const nextMode = facingRef.current === 'user' ? 'environment' : 'user';
    if (!isCamOnRef.current) {
      setCurrentFacingMode(nextMode);
      return;
    }
    try {
      const fresh = await getMedia({
        video: {
          facingMode: { ideal: nextMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      const newTrack = fresh.getVideoTracks()[0];
      const stream = net.localStream || localStream || new MediaStream();
      stopTracksOfKind(stream, 'video');
      stream.addTrack(newTrack);
      syncStream(stream);
      setCurrentFacingMode(nextMode);
      await net.replaceTrack(newTrack, 'video');
      net.broadcast({ type: 'CAM_STATUS', isCamOn: true });
    } catch (e) {
      console.error(e);
      alert('Ошибка смены камеры');
    }
  }, [localStream, stopTracksOfKind, syncStream]);

  const leaveCallRef = useRef<() => void>(() => {});

  const leaveCall = useCallback(() => {
    soundFx.leave();
    net.destroy(true);
    net.roomId = null;
    setRoomId(null);
    setPeers({});
    setScreenStreams({});
    setIsScreenSharing(false);
    setIsAdmin(false);
    setIsHandRaised(false);
    setMessages([]);
    setUnreadCount(0);
  }, []);

  leaveCallRef.current = leaveCall;

  useEffect(() => {
    const handleStatus = ({ online, reconnecting }: any) => {
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
      leaveCallRef.current();
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

  const enterRoom = useCallback((code: string) => {
    setRoomId(code);
  }, []);

  return {
    online, reconnecting, roomId, myName, isMicOn, isCamOn, isScreenSharing, isHandRaised,
    currentFacingMode, isMirrored, localStream, localScreenStream, isLocalSpeaking,
    peers, screenStreams, messages, reactions, unreadCount,
    isAdmin, hostId, hostName, isLocked, allowScreenShare,
    soundEnabled, soundVolume, showChatToasts,
    
    setMyName, setIsMicOn, setIsCamOn, setIsScreenSharing, setIsHandRaised,
    setCurrentFacingMode, setIsMirrored, setLocalStream, setLocalScreenStream, setIsLocalSpeaking,
    setUnreadCount, setMessages, spawnReaction, setSoundEnabled, setSoundVolume, setShowChatToasts,
    setAllowScreenShare, setIsLocked, setRoomId,
    
    toggleMic, toggleCam, flipCamera, enterRoom, leaveCall, syncStream
  };
}
