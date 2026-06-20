'use client';
import { useEffect, useRef } from 'react';
import { useVoice } from '../lib/useVoice';
import { Avatar } from './ui';

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

export function VoiceBar({ sessionId, selfUsername }: { sessionId: string; selfUsername: string }) {
  const { inVoice, muted, peers, remoteStreams, error, join, leave, toggleMute } = useVoice(sessionId);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-medium flex items-center gap-2">
          🎙 Voice chat
          <span className="text-xs text-gray-500 font-normal">peer-to-peer · audio only</span>
        </div>
        <div className="flex items-center gap-2">
          {inVoice ? (
            <>
              <button className={`btn ${muted ? 'btn-danger' : 'btn-ghost'}`} onClick={toggleMute}>
                {muted ? '🔇 Unmute' : '🎤 Mute'}
              </button>
              <button className="btn-ghost" onClick={leave}>Leave voice</button>
            </>
          ) : (
            <button className="btn-primary" onClick={join}>Join voice</button>
          )}
        </div>
      </div>

      {error && <div className="text-bad text-sm mt-2">{error}</div>}

      {inVoice && (
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="flex items-center gap-2 text-sm">
            <Avatar name={selfUsername} size={26} />
            <span>@{selfUsername} (you)</span>
            {muted && <span className="chip bg-bad/20 text-bad">muted</span>}
          </div>
          {peers.map((p) => (
            <div key={p.userId} className="flex items-center gap-2 text-sm">
              <Avatar name={p.username || '?'} size={26} />
              <span>@{p.username}</span>
              {p.muted && <span className="chip bg-bad/20 text-bad">muted</span>}
            </div>
          ))}
          {peers.length === 0 && <span className="text-xs text-gray-500">Waiting for others to join voice…</span>}
        </div>
      )}

      {/* hidden remote audio sinks */}
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} />
      ))}
    </div>
  );
}
