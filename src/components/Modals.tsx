import React, { useState, useEffect } from 'react';
import { useConference } from '../hooks/useConference';
import { QRCodeSVG } from 'qrcode.react';
import { net } from '../lib/p2p-net';
import { useAuditLogs } from '../lib/audit';
import { P2PAuditLog } from '../lib/audit';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Copy, Link, Settings, ShieldAlert, TerminalSquare } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface ModalsProps {
  conf: ReturnType<typeof useConference>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  isInviteOpen: boolean;
  setIsInviteOpen: (v: boolean) => void;
  isAuditOpen: boolean;
  setIsAuditOpen: (v: boolean) => void;
}

export function Modals({ conf, isSettingsOpen, setIsSettingsOpen, isInviteOpen, setIsInviteOpen, isAuditOpen, setIsAuditOpen }: ModalsProps) {
  const logs = useAuditLogs();
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [selectedAudio, setSelectedAudio] = useState<string>('');

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(d => {
      setDevices(d);
      const v = d.find(x => x.kind === 'videoinput');
      const a = d.find(x => x.kind === 'audioinput');
      if (v) setSelectedVideo(v.deviceId);
      if (a) setSelectedAudio(a.deviceId);
    });
  }, []);

  const copyLogs = () => {
    navigator.clipboard.writeText(P2PAuditLog.exportText());
    toast.success("Логи скопированы");
  };

  const clearLogs = () => {
    P2PAuditLog.clear();
  };

  const copyInvite = () => {
    const url = conf.roomId ? `${window.location.href.split('#')[0]}#${conf.roomId}` : net.getShareUrl();
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  const handleDeviceChange = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: selectedVideo ? { exact: selectedVideo } : undefined },
        audio: { deviceId: selectedAudio ? { exact: selectedAudio } : undefined }
      });
      conf.setLocalStream(stream);
      net.localStream = stream;
      if (stream.getVideoTracks()[0]) await net.replaceTrack(stream.getVideoTracks()[0], 'video');
      if (stream.getAudioTracks()[0]) await net.replaceTrack(stream.getAudioTracks()[0], 'audio');
      toast.success("Настройки применены");
    } catch (e) {
      toast.error("Ошибка смены оборудования");
    }
  };

  return (
    <>
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="settings-dialog-content sm:max-w-[500px] bg-[var(--bg-surface)] text-foreground border-[var(--border-subtle)] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2"><Settings size={18} /> Настройки</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="devices" className="w-full flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="settings-tabs-scroll shrink-0">
              <TabsList className="w-full bg-transparent justify-start rounded-none h-auto p-0 px-3">
                <TabsTrigger value="devices" className="settings-tab-trigger">Оборудование</TabsTrigger>
                <TabsTrigger value="ui" className="settings-tab-trigger">UI & Звук</TabsTrigger>
                <TabsTrigger value="admin" className="settings-tab-trigger">Админ</TabsTrigger>
              </TabsList>
            </div>
            
            <div className="settings-body flex-1 overflow-y-auto min-h-0">
            <TabsContent value="devices" className="space-y-4 mt-0">
              <div className="space-y-2">
                <label className="studio-label">Камера</label>
                <select 
                  className="studio-select" 
                  value={selectedVideo} 
                  onChange={e => setSelectedVideo(e.target.value)}
                >
                  {devices.filter(d => d.kind === 'videoinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Камера'}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="studio-label">Микрофон</label>
                <select 
                  className="studio-select" 
                  value={selectedAudio} 
                  onChange={e => setSelectedAudio(e.target.value)}
                >
                  {devices.filter(d => d.kind === 'audioinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Микрофон'}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={conf.isMirrored} onCheckedChange={conf.setIsMirrored} />
                <span className="text-sm">Зеркалировать собственную камеру</span>
              </div>
              <Button onClick={handleDeviceChange} className="w-full studio-btn-primary mt-2 text-black">Применить</Button>
            </TabsContent>

            <TabsContent value="ui" className="space-y-4 mt-0">
              <div className="flex items-center gap-2">
                <Switch checked={conf.soundEnabled} onCheckedChange={conf.setSoundEnabled} />
                <span className="text-sm">Звуковые эффекты</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={conf.showChatToasts} onCheckedChange={conf.setShowChatToasts} />
                <span className="text-sm">Всплывающие сообщения поверх видео</span>
              </div>
              <div className="space-y-2 pt-2">
                <label className="studio-label">Громкость звуков ({Math.round(conf.soundVolume*100)}%)</label>
                <Slider min={0} max={1} step={0.05} value={[conf.soundVolume]} onValueChange={v => conf.setSoundVolume(v[0])} />
              </div>
            </TabsContent>

            <TabsContent value="admin" className="space-y-4 mt-0">
              <div className="admin-status-box">
                <ShieldAlert size={16} />
                {conf.isAdmin ? 'Вы являетесь администратором комнаты' : `Участник (Хост: ${conf.hostName || 'Host'})`}
              </div>
              <div className={`space-y-4 ${conf.isAdmin ? '' : 'opacity-50 pointer-events-none'}`}>
                <div className="flex items-center gap-2">
                  <Switch checked={conf.isLocked} onCheckedChange={v => { conf.setIsLocked(v); net.setRoomLocked(v); }} />
                  <span className="text-sm">Заблокировать комнату для новых участников</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={conf.allowScreenShare} onCheckedChange={v => { conf.setAllowScreenShare(v); net.setScreenShareAllowed(v); }} />
                  <span className="text-sm">Разрешить участникам демонстрацию экрана</span>
                </div>
                <div className="pt-2">
                  <label className="studio-label">Участники ({Object.keys(conf.peers).length + 1})</label>
                  <ScrollArea className="h-32 rounded border border-border p-2 mt-2">
                    <div className="participant-row mb-1">
                      <span><strong>{conf.myName}</strong> (Вы {conf.isAdmin ? '👑' : ''})</span>
                    </div>
                    {Object.values(conf.peers).map(p => (
                      <div key={p.id} className="participant-row mb-1">
                        <span>{p.name} {conf.hostId === p.id ? '👑' : ''}</span>
                        {conf.isAdmin && (
                          <Button variant="destructive" size="sm" className="h-6 text-[10px]" onClick={() => {
                            if (confirm("Исключить?")) net.kickPeer(p.id);
                          }}>Исключить</Button>
                        )}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background text-foreground border-border text-center">
          <DialogHeader>
            <DialogTitle>Пригласить участников</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-xs text-muted-foreground font-mono">КОД ВСТРЕЧИ</div>
            <div className="text-2xl font-mono font-bold text-blue-400 tracking-widest">{conf.roomId}</div>
            <div className="p-2 bg-white rounded-md">
              <QRCodeSVG
                value={conf.roomId ? `${window.location.href.split('#')[0]}#${conf.roomId}` : net.getShareUrl()}
                size={140}
                fgColor="#131314"
              />
            </div>
            <Button onClick={copyInvite} className="w-full studio-btn-primary text-black">
              <Link size={16} className="mr-2" /> Скопировать ссылку
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAuditOpen} onOpenChange={setIsAuditOpen}>
        <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col bg-background text-foreground border-border">
          <DialogHeader className="flex flex-row justify-between items-center pr-8">
            <DialogTitle className="flex items-center gap-2 text-yellow-400">
              <TerminalSquare size={18} /> Системный аудит
            </DialogTitle>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copyLogs}><Copy size={14} className="mr-2" /> Копировать</Button>
              <Button variant="secondary" size="sm" onClick={clearLogs}>Очистить</Button>
            </div>
          </DialogHeader>
          <ScrollArea className="log-terminal-window flex-1">
            {logs.map((log, i) => (
              <div key={i} className="log-line">
                <span className="log-time">[{log.time}]</span>
                <span className={`log-tag log-tag-${log.category}`}>{log.category}</span>
                <span>
                  {log.message}{' '}
                  {log.extra && <span className="text-gray-400">{log.extra}</span>}
                </span>
              </div>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
