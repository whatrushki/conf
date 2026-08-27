export type LogCategory = 'SYS' | 'NET' | 'MEDIA' | 'ICE' | 'ERR' | 'WARN';

export interface AuditLogEntry {
  time: string;
  category: LogCategory;
  message: string;
  extra: string;
}

class AuditLogger {
  logs: AuditLogEntry[] = [];
  listeners: Set<() => void> = new Set();

  add(category: LogCategory, message: string, extra: any = null) {
    const time = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
    const extraStr = extra ? (typeof extra === 'object' ? JSON.stringify(extra) : String(extra)) : '';
    this.logs.push({ time, category, message, extra: extraStr });
    if (this.logs.length > 700) this.logs.shift();
    this.notify();
  }

  exportText() {
    return this.logs.map(l => `[${l.time}] [${l.category}] ${l.message} ${l.extra}`).join('\n');
  }

  clear() {
    this.logs = [];
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const P2PAuditLog = new AuditLogger();

// Hook for React components
import { useState, useEffect } from 'react';

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>(P2PAuditLog.logs);

  useEffect(() => {
    return P2PAuditLog.subscribe(() => {
      setLogs([...P2PAuditLog.logs]);
    });
  }, []);

  return logs;
}
