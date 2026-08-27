import React, { useState } from 'react';
import { ChatMessage } from '../hooks/useConference';
import { net } from '../lib/p2p-net';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, Send, MessageSquare } from 'lucide-react';
import { soundFx } from '../lib/audio';

interface SidebarChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  myName: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function SidebarChat({ isOpen, onClose, messages, myName, setMessages }: SidebarChatProps) {
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim()) return;
    soundFx.chat();
    setMessages(prev => [...prev, { sender: "Вы", text: text.trim(), isMe: true, timestamp: Date.now() }]);
    net.broadcast({ type: 'CHAT_MSG', name: myName, text: text.trim() });
    setText('');
  };

  if (!isOpen) return null;

  return (
    <aside className="chat-drawer">
      <div className="chat-header">
        <div className="chat-header-title">
          <MessageSquare size={18} />
          <span>Сообщения встречи</span>
        </div>
        <button className="tile-action-btn" onClick={onClose} title="Закрыть чат">
          <X size={18} />
        </button>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-msg ${msg.isMe ? 'me' : 'other'}`}>
            <div className="chat-msg-author">{msg.sender}</div>
            <div className="chat-msg-bubble">{msg.text}</div>
          </div>
        ))}
      </div>
      
      <div className="chat-input-box">
        <Input 
          value={text} 
          onChange={e => setText(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && send()} 
          placeholder="Отправить сообщение..." 
        />
        <Button onClick={send} className="send-btn">
          <Send size={18} />
        </Button>
      </div>
    </aside>
  );
}
