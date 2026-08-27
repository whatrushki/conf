/** Стабильные placeholder-треки: камера/мик реально освобождаются, WebRTC-sender живёт. */

let silentCtx: AudioContext | null = null;

export function createSilentAudioTrack(): MediaStreamTrack {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!silentCtx || silentCtx.state === 'closed') {
    silentCtx = new AudioCtx();
  }
  if (silentCtx.state === 'suspended') {
    silentCtx.resume().catch(() => {});
  }
  const oscillator = silentCtx.createOscillator();
  const gain = silentCtx.createGain();
  gain.gain.value = 0;
  const dest = silentCtx.createMediaStreamDestination();
  oscillator.connect(gain);
  gain.connect(dest);
  oscillator.start();
  const track = dest.stream.getAudioTracks()[0];
  // остановить oscillator вместе с треком
  const origStop = track.stop.bind(track);
  track.stop = () => {
    try { oscillator.stop(); } catch { /* */ }
    try { oscillator.disconnect(); } catch { /* */ }
    try { gain.disconnect(); } catch { /* */ }
    origStop();
  };
  (track as any).__placeholder = true;
  return track;
}

export function createBlackVideoTrack(width = 640, height = 480): MediaStreamTrack {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111113';
  ctx.fillRect(0, 0, width, height);

  // captureStream требует хотя бы один кадр; на части браузеров нужен «тик»
  const stream = (canvas as any).captureStream(5) as MediaStream;
  const track = stream.getVideoTracks()[0];

  let raf = 0;
  const draw = () => {
    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, width, height);
    raf = requestAnimationFrame(draw);
  };
  draw();

  const origStop = track.stop.bind(track);
  track.stop = () => {
    cancelAnimationFrame(raf);
    origStop();
  };
  (track as any).__placeholder = true;
  return track;
}

export function isPlaceholderTrack(track: MediaStreamTrack | null | undefined): boolean {
  return !!(track && (track as any).__placeholder);
}

/** Уникальные реальные камеры: один на groupId, без пустых дублей. */
export async function listRealVideoDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videos = devices.filter(d => d.kind === 'videoinput' && d.deviceId);
  const byGroup = new Map<string, MediaDeviceInfo>();
  for (const d of videos) {
    const key = d.groupId || d.deviceId;
    const existing = byGroup.get(key);
    // предпочитаем с непустым label
    if (!existing || (!existing.label && d.label)) {
      byGroup.set(key, d);
    }
  }
  return Array.from(byGroup.values());
}

export async function listRealAudioDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audios = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
  const byGroup = new Map<string, MediaDeviceInfo>();
  for (const d of audios) {
    const key = d.groupId || d.deviceId;
    const existing = byGroup.get(key);
    if (!existing || (!existing.label && d.label)) {
      byGroup.set(key, d);
    }
  }
  return Array.from(byGroup.values());
}

export async function pickCameraDeviceId(facing: 'user' | 'environment'): Promise<string | null> {
  const list = await listRealVideoDevices();
  if (!list.length) return null;

  const scored = list.map(d => {
    const label = (d.label || '').toLowerCase();
    let score = 0;
    if (facing === 'environment') {
      if (/back|rear|environment|тыл|задн|world/i.test(label)) score += 10;
      if (/front|user|face|перед|фронт/i.test(label)) score -= 5;
    } else {
      if (/front|user|face|перед|фронт/i.test(label)) score += 10;
      if (/back|rear|environment|тыл|задн|world/i.test(label)) score -= 5;
    }
    return { d, score };
  }).sort((a, b) => b.score - a.score);

  if (scored[0].score > 0) return scored[0].d.deviceId;

  // capabilities только для 1–2 кандидатов
  for (const { d } of scored.slice(0, 2)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: d.deviceId } },
        audio: false
      });
      const t = s.getVideoTracks()[0];
      const caps = t.getCapabilities?.() as MediaTrackCapabilities & { facingMode?: string[] };
      const modes = caps?.facingMode || [];
      s.getTracks().forEach(x => x.stop());
      if (modes.includes(facing)) return d.deviceId;
    } catch {
      /* phantom */
    }
  }

  if (facing === 'environment' && list.length > 1) return list[list.length - 1].deviceId;
  return list[0].deviceId;
}
