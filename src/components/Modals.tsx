import React, { useState, useEffect } from 'react';
import { useConference } from '../hooks/useConference';
import { QRCodeSVG } from 'qrcode.react';
import { net } from '../lib/p2p-net';
import { useAuditLogs } from '../lib/audit';
import { P2PAuditLog } from '../lib/audit';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Copy, Link, Settings, ShieldAlert, TerminalSquare, X } from 'lucide-react';

interface ModalsProps {
  conf: ReturnType<typeof useConference>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  isInviteOpen: boolean;
  setIsInviteOpen: (v: boolean) => void;
  isAuditOpen: boolean;
  setIsAuditOpen: (v: boolean) => void;
}

function StudioModal({
  open,
  onClose,
  title,
  icon,
  wide,
  children,
  headerExtra
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="p2p-modal-backdrop centered-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`studio-modal ${wide ? 'modal-large' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            {icon}
            <span>{title}</span>
          </div>
          <div className="modal-header-actions">
            {headerExtra}
            <button type="button" className="tile-action-btn" onClick={onClose} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modals({ conf, isSettingsOpen, setIsSettingsOpen, isInviteOpen, setIsInviteOpen, isAuditOpen, setIsAuditOpen }: ModalsProps) {
  const logs = useAuditLogs();
  const [tab, setTab] = useState<'devices' | 'ui' | 'admin'>('devices');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAudio, setSelectedAudio] = useState('');

  useEffect(() => {
    if (!isSettingsOpen) return;
    navigator.mediaDevices.enumerateDevices().then(d => {
      setDevices(d);
      const v = d.find(x => x.kind === 'videoinput');
      const a = d.find(x => x.kind === 'audioinput');
      if (v) setSelectedVideo(v.deviceId);
      if (a) setSelectedAudio(a.deviceId);
    });
  }, [isSettingsOpen]);

  const copyLogs = () => {
    navigator.clipboard.writeText(P2PAuditLog.exportText());
    toast.success("Логи скопированы");
  };

  const inviteUrl = conf.roomId
    ? `${window.location.href.split('#')[0]}#${conf.roomId}`
    : net.getShareUrl();

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Ссылка скопирована");
  };

  const handleDeviceChange = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
        audio: selectedAudio ? { deviceId: { exact: selectedAudio } } : true
      });
      // остановить старые треки
      conf.localStream?.getTracks().forEach(t => t.stop());
      conf.syncStream(stream);
      if (stream.getVideoTracks()[0]) await net.replaceTrack(stream.getVideoTracks()[0], 'video');
      if (stream.getAudioTracks()[0]) await net.replaceTrack(stream.getAudioTracks()[0], 'audio');
      conf.setIsCamOn(!!stream.getVideoTracks()[0]);
      conf.setIsMicOn(!!stream.getAudioTracks()[0]);
      toast.success("Настройки применены");
    } catch (e) {
      toast.error("Ошибка смены оборудования");
    }
  };

  return (
    <>
      <StudioModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Настройки"
        icon={<Settings size={18} />}
      >
        <div className="settings-tabs-scroll">
          <div className="settings-tabs">
            <button type="button" className={`settings-tab-btn ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>Оборудование</button>
            <button type="button" className={`settings-tab-btn ${tab === 'ui' ? 'active' : ''}`} onClick={() => setTab('ui')}>Интерфейс & Звук</button>
            <button type="button" className={`settings-tab-btn ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Админ</button>
          </div>
        </div>

        <div className="settings-body">
          {tab === 'devices' && (
            <div className="settings-stack">
              <div className="settings-form-group">
                <label className="studio-label">Камера</label>
                <select className="studio-select" value={selectedVideo} onChange={e => setSelectedVideo(e.target.value)}>
                  {devices.filter(d => d.kind === 'videoinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Камера'}</option>
                  ))}
                </select>
              </div>
              <div className="settings-form-group">
                <label className="studio-label">Микрофон</label>
                <select className="studio-select" value={selectedAudio} onChange={e => setSelectedAudio(e.target.value)}>
                  {devices.filter(d => d.kind === 'audioinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Микрофон'}</option>
                  ))}
                </select>
              </div>
              <label className="settings-switch-row">
                <Switch checked={conf.isMirrored} onCheckedChange={conf.setIsMirrored} />
                <span>Зеркалировать собственную камеру</span>
              </label>
              <button type="button" className="studio-btn-primary w-full" onClick={handleDeviceChange}>Применить</button>
            </div>
          )}

          {tab === 'ui' && (
            <div className="settings-stack">
              <label className="settings-switch-row">
                <Switch checked={conf.soundEnabled} onCheckedChange={conf.setSoundEnabled} />
                <span>Звуковые эффекты</span>
              </label>
              <label className="settings-switch-row">
                <Switch checked={conf.showChatToasts} onCheckedChange={conf.setShowChatToasts} />
                <span>Всплывающие сообщения поверх видео</span>
              </label>
              <div className="settings-form-group">
                <label className="studio-label">Громкость звуков ({Math.round(conf.soundVolume * 100)}%)</label>
                <Slider min={0} max={1} step={0.05} value={[conf.soundVolume]} onValueChange={v => conf.setSoundVolume(v[0])} />
              </div>
            </div>
          )}

          {tab === 'admin' && (
            <div className="settings-stack">
              <div className="admin-status-box">
                <ShieldAlert size={16} />
                {conf.isAdmin ? 'Вы являетесь администратором комнаты' : `Участник (Хост: ${conf.hostName || 'Host'})`}
              </div>
              <div className={conf.isAdmin ? '' : 'opacity-50 pointer-events-none'}>
                <label className="settings-switch-row">
                  <Switch checked={conf.isLocked} onCheckedChange={v => { conf.setIsLocked(v); net.setRoomLocked(v); }} />
                  <span>Заблокировать комнату</span>
                </label>
                <label className="settings-switch-row">
                  <Switch checked={conf.allowScreenShare} onCheckedChange={v => { conf.setAllowScreenShare(v); net.setScreenShareAllowed(v); }} />
                  <span>Разрешить демонстрацию экрана</span>
                </label>
                <div className="settings-form-group mt-3">
                  <label className="studio-label">Участники ({Object.keys(conf.peers).length + 1})</label>
                  <div className="participants-list">
                    <div className="participant-row">
                      <span><strong>{conf.myName}</strong> (Вы{conf.isAdmin ? ' · хост' : ''})</span>
                    </div>
                    {Object.values(conf.peers).map(p => (
                      <div key={p.id} className="participant-row">
                        <span>{p.name}{conf.hostId === p.id ? ' · хост' : ''}</span>
                        {conf.isAdmin && (
                          <Button variant="destructive" size="sm" className="h-6 text-[10px]" onClick={() => {
                            if (confirm("Исключить?")) net.kickPeer(p.id);
                          }}>Исключить</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </StudioModal>

      <StudioModal
        open={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Пригласить участников"
      >
        <div className="invite-body">
          <div className="invite-code-label">КОД ВСТРЕЧИ</div>
          <div className="invite-code">{conf.roomId}</div>
          <div className="invite-qr-wrap">
            <QRCodeSVG value={inviteUrl} size={148} fgColor="#131314" />
          </div>
          <button type="button" className="studio-btn-primary w-full" onClick={copyInvite}>
            <Link size={16} /> Скопировать ссылку
          </button>
        </div>
      </StudioModal>

      <StudioModal
        open={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        title="Системный аудит"
        icon={<TerminalSquare size={18} className="text-yellow-400" />}
        wide
        headerExtra={
          <>
            <button type="button" className="studio-btn-compact" onClick={copyLogs}><Copy size={14} /> Копировать</button>
            <button type="button" className="studio-btn-compact" onClick={() => P2PAuditLog.clear()}>Очистить</button>
          </>
        }
      >
        <div className="log-terminal-window">
          {logs.length === 0 && <div className="log-line text-muted-foreground">Логов пока нет</div>}
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
        </div>
      </StudioModal>
    </>
  );
}
