'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { Avatar, relTime } from './ui';

export function ChatPanel({ roomId, compact }: { roomId: string; compact?: boolean }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    api.get(`/rooms/${roomId}/messages?limit=50`).then((r) => mounted && setMessages(r.data));
    const s = getSocket();
    s.emit('room.subscribe', { roomId });

    const onCreated = (m: any) => {
      if (m.roomId !== roomId) return;
      setMessages((prev) => {
        // reconcile optimistic by clientNonce
        const idx = prev.findIndex((x) => x.clientNonce && x.clientNonce === m.clientNonce);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = m;
          return copy;
        }
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
    };
    const onUpdated = (m: any) =>
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body: m.body, edited: true } : x)));
    const onDeleted = (m: any) =>
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body: '', deleted: true } : x)));
    const onTyping = (t: any) => {
      if (t.userId === user?.id) return;
      setTyping((prev) => (t.isTyping ? [...new Set([...prev, t.username])] : prev.filter((u) => u !== t.username)));
    };

    s.on('chat.message.created', onCreated);
    s.on('chat.message.updated', onUpdated);
    s.on('chat.message.deleted', onDeleted);
    s.on('chat.typing', onTyping);
    return () => {
      mounted = false;
      s.off('chat.message.created', onCreated);
      s.off('chat.message.updated', onUpdated);
      s.off('chat.message.deleted', onDeleted);
      s.off('chat.typing', onTyping);
    };
  }, [roomId, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function send() {
    const body = text.trim();
    if (!body) return;
    const s = getSocket();
    if (editing) {
      s.emit('chat.message.edit', { roomId, messageId: editing, body });
      setEditing(null);
    } else {
      const clientNonce = Math.random().toString(36).slice(2);
      setMessages((prev) => [
        ...prev,
        { id: 'tmp_' + clientNonce, clientNonce, authorUserId: user.id, authorUsername: user.username, body, createdAt: new Date().toISOString(), pending: true },
      ]);
      s.emit('chat.message.send', { roomId, body, clientNonce });
    }
    setText('');
  }

  return (
    <div className={`card flex flex-col ${compact ? 'h-[60vh]' : 'h-[70vh]'}`}>
      <div className="px-4 py-2.5 border-b border-edge text-sm font-medium flex items-center justify-between">
        <span>Room chat</span>
        <span className="text-xs text-gray-500">permanent · survives every session</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">
            Say hi 👋 — this chat is permanent and stays here across every session and video.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2 group">
            <Avatar name={m.authorUsername} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">@{m.authorUsername}</span>
                <span className="text-[10px] text-gray-600">{relTime(m.createdAt)}</span>
                {m.edited && <span className="text-[10px] text-gray-600">(edited)</span>}
                {m.pending && <span className="text-[10px] text-gray-600">· sending</span>}
              </div>
              {m.deleted ? (
                <div className="text-sm text-gray-600 italic">This message was deleted</div>
              ) : (
                <div className="text-sm text-gray-200 break-words whitespace-pre-wrap">{m.body}</div>
              )}
            </div>
            {m.authorUserId === user?.id && !m.deleted && !m.pending && (
              <div className="opacity-0 group-hover:opacity-100 flex gap-1 text-[10px]">
                <button
                  className="text-gray-500 hover:text-gray-200"
                  onClick={() => {
                    setEditing(m.id);
                    setText(m.body);
                  }}
                >
                  edit
                </button>
                <button
                  className="text-gray-500 hover:text-bad"
                  onClick={() => getSocket().emit('chat.message.delete', { roomId, messageId: m.id })}
                >
                  delete
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {typing.length > 0 && <div className="px-4 text-[11px] text-gray-500">{typing.join(', ')} typing…</div>}
      <div className="p-3 border-t border-edge flex gap-2">
        <input
          className="input"
          placeholder={editing ? 'Edit message…' : 'Message the room…'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            getSocket().emit('chat.typing', { roomId, isTyping: e.target.value.length > 0 });
          }}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        {editing && (
          <button className="btn-ghost" onClick={() => { setEditing(null); setText(''); }}>
            Cancel
          </button>
        )}
        <button className="btn-primary" onClick={send} disabled={!text.trim()}>
          {editing ? 'Save' : 'Send'}
        </button>
      </div>
    </div>
  );
}
