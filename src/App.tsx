/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Lobby } from './components/Lobby';
import { ConferenceLayout } from './components/ConferenceLayout';
import { Modals } from './components/Modals';
import { useConference } from './hooks/useConference';
import { Toaster } from './components/ui/sonner';
import { TerminalSquare, Settings } from 'lucide-react';
import './index.css';

export default function App() {
  const conf = useConference();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  useEffect(() => {
    const openInvite = () => setIsInviteOpen(true);
    const openSettings = () => setIsSettingsOpen(true);
    const openAudit = () => setIsAuditOpen(true);

    window.addEventListener('openInvite', openInvite);
    window.addEventListener('openSettings', openSettings);
    window.addEventListener('openAudit', openAudit);

    return () => {
      window.removeEventListener('openInvite', openInvite);
      window.removeEventListener('openSettings', openSettings);
      window.removeEventListener('openAudit', openAudit);
    };
  }, []);

  const handleEnter = (code: string) => {
    if (!code) {
      conf.leaveCall();
      return;
    }
    conf.enterRoom(code);
  };

  return (
    <div className="conf-app" id="appRoot">
      <Toaster theme="dark" position="top-center" />
      
      <header className="studio-header">
        <div className="studio-logo-area">
          <span className="gemini-sparkle">✦</span>
          <div className="studio-title">WHAT CONF</div>
        </div>

        <div className="header-actions">
          <div className={`studio-badge ${conf.online ? (conf.reconnecting ? 'reconnecting' : 'online') : ''}`}>
            <span className="status-dot"></span>
            <span>{conf.reconnecting ? 'RECONNECTING' : (conf.online ? (conf.roomId ? `ROOM: ${conf.roomId}` : 'ONLINE') : 'STANDBY')}</span>
          </div>
          <button className="studio-btn-compact" onClick={() => setIsAuditOpen(true)} title="Системный аудит">
            <TerminalSquare size={14} className="text-yellow-400" />
            <span className="hide-mobile">Audit</span>
          </button>
          <button className="studio-btn-compact hide-mobile" onClick={() => setIsSettingsOpen(true)} title="Настройки">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {!conf.roomId ? (
        <Lobby
          onEnter={handleEnter}
          myName={conf.myName}
          setMyName={conf.setMyName}
          isMicOn={conf.isMicOn}
          isCamOn={conf.isCamOn}
          toggleMic={conf.toggleMic}
          toggleCam={conf.toggleCam}
          currentFacingMode={conf.currentFacingMode}
          flipCamera={conf.flipCamera}
          isMirrored={conf.isMirrored}
          localStream={conf.localStream}
          syncStream={conf.syncStream}
          setIsMicOn={conf.setIsMicOn}
          setIsCamOn={conf.setIsCamOn}
        />
      ) : (
        <ConferenceLayout conf={conf} />
      )}

      <Modals
        conf={conf}
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
        isInviteOpen={isInviteOpen} setIsInviteOpen={setIsInviteOpen}
        isAuditOpen={isAuditOpen} setIsAuditOpen={setIsAuditOpen}
      />
    </div>
  );
}
