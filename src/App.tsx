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
import { P2PNet } from './lib/p2p-net';
import { TerminalSquare, Settings } from 'lucide-react';
import './index.css';

export default function App() {
  const conf = useConference();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.substring(1).trim();
      if (hash.length >= 3) {
        // We could auto-fill or just let user click join
        const code = P2PNet.cleanCode(hash);
        // We will just leave it in URL, Lobby component could read it but we will keep it simple
      }
    };
    handleHash();

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

  return (
    <div className="conf-app" id="appRoot">
      <Toaster theme="dark" position="top-center" />
      
      {/* Header */}
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
          <button className="studio-btn-compact hide-mobile" onClick={() => setIsAuditOpen(true)} title="Системный аудит">
            <TerminalSquare size={14} className="text-yellow-400" />
            <span>Audit</span>
          </button>
          <button className="studio-btn-compact hide-mobile" onClick={() => setIsSettingsOpen(true)} title="Настройки">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      {!conf.roomId ? (
        <Lobby 
          onJoin={() => {}} // State handles transition
          myName={conf.myName}
          setMyName={conf.setMyName}
          isMicOn={conf.isMicOn}
          setIsMicOn={conf.setIsMicOn}
          isCamOn={conf.isCamOn}
          setIsCamOn={conf.setIsCamOn}
          currentFacingMode={conf.currentFacingMode}
          setCurrentFacingMode={conf.setCurrentFacingMode}
          isMirrored={conf.isMirrored}
          localStream={conf.localStream}
          setLocalStream={conf.setLocalStream}
        />
      ) : (
        <ConferenceLayout conf={conf} />
      )}

      {/* Modals */}
      <Modals 
        conf={conf}
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
        isInviteOpen={isInviteOpen} setIsInviteOpen={setIsInviteOpen}
        isAuditOpen={isAuditOpen} setIsAuditOpen={setIsAuditOpen}
      />
    </div>
  );
}
