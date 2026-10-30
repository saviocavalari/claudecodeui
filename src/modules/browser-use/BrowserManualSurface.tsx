import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, MonitorPlay, RotateCw } from 'lucide-react';

import { localizeServerMessage } from '@/modules/browser-use/browserUseServerText';
import { api, readApiJson } from '@/shared/api';
import type { BrowserManualAction, BrowserUseSession } from '@/shared/types';
import { Button } from '@/shared/ui';

type Tab = { index: number; url: string; active: boolean };
type Result = { data: { session: BrowserUseSession; tabs: Tab[] } };

/** Used by BrowserUsePanel in normal/fullscreen views to send user input directly to the shared browser session. */
export function BrowserManualSurface({ session, onSession, fullscreen, visible }: {
  session: BrowserUseSession; onSession: (session: BrowserUseSession) => void; fullscreen: boolean; visible: boolean;
}) {
  const { t } = useTranslation('settings');
  // The user explicitly takes/releases control; an active lease pauses agent input.
  const [controlled, setControlled] = useState(false);
  // Address edits stay local until navigation is submitted.
  const [addressDraft, setAddressDraft] = useState<string | null>(null);
  const address = addressDraft ?? (session.url === 'about:blank' ? '' : session.url || '');
  // Runtime tab inventory includes login popups without switching tabs unexpectedly.
  const [tabs, setTabs] = useState<Tab[]>([]);
  // Errors are generic so credentials never appear in feedback.
  const [error, setError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const epoch = useRef(0);
  const active = useRef(false);
  const leaseRequested = useRef(false);
  const mounted = useRef(true);
  const composing = useRef(false);
  const path = useRef<{ x: number; y: number }[]>([]);
  const onSessionRef = useRef(onSession);
  useEffect(() => { onSessionRef.current = onSession; }, [onSession]);


  const send = useCallback((input: BrowserManualAction) => {
    if (input.action !== 'control' && !active.current) return;
    if (input.action === 'control' && input.enabled) leaseRequested.current = true;
    const generation = epoch.current;
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      if (generation !== epoch.current || !mounted.current) return;
      try {
        const response = await api.browserUse.manualInput(session.id, input);
        const result = await readApiJson<Result>(response);
        if (!mounted.current) return;
        if (input.action === 'control') { active.current = input.enabled; setControlled(input.enabled); }
        onSessionRef.current(result.data.session);
        setTabs(result.data.tabs);
        setError(false);
      } catch {
        epoch.current += 1;
        active.current = false;
        if (mounted.current) { setControlled(false); setError(true); }
      }
    }).finally(() => { pending.current -= 1; });
  }, [session.id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
      // Release after in-flight input, including a pending control acquisition.
      if (leaseRequested.current) void queue.current.then(() => api.browserUse.manualInput(session.id, { action: 'control', enabled: false })).catch(() => undefined);
      active.current = false;
    };
  }, [session.id]);

  useEffect(() => {
    if (!visible) { if (active.current) send({ action: 'control', enabled: false }); return; }
    const timer = window.setInterval(() => {
      if (active.current && pending.current === 0) send({ action: 'snapshot' });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [send, visible]);

  const pointAt = useCallback((clientX: number, clientY: number) => {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect || !session.viewport || !rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(session.viewport.width - 1, (clientX - rect.left) * session.viewport.width / rect.width)),
      y: Math.max(0, Math.min(session.viewport.height - 1, (clientY - rect.top) * session.viewport.height / rect.height)),
    };
  }, [session.viewport]);
  // Last point the agent or the user acted on, as a share of the screenshot.
  const cursorStyle = session.cursor && session.viewport ? {
    left: `${(session.cursor.x / session.viewport.width) * 100}%`,
    top: `${(session.cursor.y / session.viewport.height) * 100}%`,
  } : null;
  // Wheel requires a non-passive handler to keep the local page from scrolling.
  const hasScreenshot = Boolean(session.screenshotDataUrl);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const wheel = (event: WheelEvent) => {
      if (!active.current) return;
      event.preventDefault();
      const point = pointAt(event.clientX, event.clientY);
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 900 : 1;
      if (point) send({ action: 'scroll', ...point, deltaX: Math.max(-4000, Math.min(4000, event.deltaX * factor)), deltaY: Math.max(-4000, Math.min(4000, event.deltaY * factor)) });
    };
    image.addEventListener('wheel', wheel, { passive: false });
    return () => image.removeEventListener('wheel', wheel);
  }, [send, pointAt, hasScreenshot]);

  const keyboard = (event: KeyboardEvent<HTMLElement>, directText = true) => {
    if (!active.current || event.nativeEvent.isComposing || composing.current) return;
    // Let browser paste deliver clipboard text through onPaste; never read clipboard automatically.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
    const special = ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    if (special.includes(event.key) || ((event.ctrlKey || event.metaKey || event.altKey) && /^[a-zA-Z0-9]$/.test(event.key))) {
      event.preventDefault();
      const modifiers = [event.ctrlKey && 'Control', event.metaKey && 'Meta', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
      send({ action: 'key', key: [...modifiers, event.key].join('+') });
    } else if (directText && event.key.length === 1) {
      event.preventDefault(); send({ action: 'text', text: event.key });
    }
  };
  const endPointer = (event: PointerEvent<HTMLImageElement>) => {
    if (!active.current || !path.current.length) return;
    const point = pointAt(event.clientX, event.clientY);
    const first = path.current[0];
    if (point && Math.hypot(point.x - first.x, point.y - first.y) > 3) path.current.push(point);
    send({ action: 'pointer', points: path.current.slice(0, 200) });
    path.current = [];
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-2 border-b bg-background p-2">
      <Button size="sm" variant={controlled ? 'default' : 'outline'} disabled={session.status !== 'ready'} onClick={() => send({ action: 'control', enabled: !controlled })}>{t(`browserUse.manual.${controlled ? 'release' : 'take'}`)}</Button>
      {(['back', 'forward', 'reload'] as const).map((action, index) => {
        const Icon = [ArrowLeft, ArrowRight, RotateCw][index];
        return <Button key={action} size="sm" variant="ghost" disabled={!controlled} aria-label={t(`browserUse.manual.${action}`)} onClick={() => send({ action })}><Icon className="h-4 w-4" /></Button>;
      })}
      <form className="flex min-w-[180px] flex-1 gap-2" onSubmit={event => { event.preventDefault(); send({ action: 'navigate', url: address }); setAddressDraft(null); }}>
        <input aria-label={t('browserUse.manual.address')} className="min-w-0 flex-1 rounded border bg-background px-2 text-sm text-foreground" value={address} onChange={event => setAddressDraft(event.target.value)} placeholder="https://…" disabled={!controlled} />
        <Button size="sm" disabled={!controlled || !address.trim()}>{t('browserUse.manual.go')}</Button>
      </form>
    </div>
    {tabs.length > 1 && <div className="flex gap-2 overflow-x-auto bg-background p-2">{tabs.map(tab => <button key={tab.index} disabled={!controlled} onClick={() => send({ action: 'tab', index: tab.index })} className={`max-w-64 truncate rounded border px-2 py-1 text-xs ${tab.active ? 'border-primary text-primary' : 'text-muted-foreground'}`}>{tab.index + 1}. {tab.url}</button>)}</div>}
    <p role="status" className={`bg-background px-3 py-2 text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{t(`browserUse.manual.${error ? 'failed' : controlled ? 'hint' : 'observe'}`)}</p>
    {controlled && <input type="password" autoComplete="off" aria-label={t('browserUse.manual.keyboard')} placeholder={t('browserUse.manual.keyboard')} className="mx-3 mb-2 rounded border bg-background px-2 py-1 text-sm text-foreground"
      onKeyDown={event => keyboard(event, false)}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={event => { composing.current = false; send({ action: 'text', text: event.currentTarget.value }); event.currentTarget.value = ''; }}
      onChange={event => { if (!composing.current && event.target.value) { send({ action: 'text', text: event.target.value }); event.target.value = ''; } }} />}
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-neutral-950">
      {session.screenshotDataUrl ? <div className="relative inline-block max-h-full"><img ref={imageRef} src={session.screenshotDataUrl} alt={t('browserUse.screenshotAlt')} draggable={false} tabIndex={controlled ? 0 : -1}
        aria-label={t('browserUse.manual.surface')}
        className={`block h-auto max-w-full object-contain outline-none focus:ring-2 focus:ring-primary ${fullscreen ? 'max-h-[70vh]' : 'max-h-[65vh]'}`}
        style={{ touchAction: controlled ? 'none' : 'auto', cursor: controlled ? 'crosshair' : 'default' }}
        onPointerDown={event => { if (!active.current || event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); const point = pointAt(event.clientX, event.clientY); path.current = point ? [point] : []; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!path.current.length || path.current.length >= 199) return; const point = pointAt(event.clientX, event.clientY); const last = path.current[path.current.length - 1]; if (point && Math.hypot(point.x - last.x, point.y - last.y) > 3) path.current.push(point); }}
        onPointerUp={endPointer} onPointerCancel={() => { path.current = []; }} onKeyDown={keyboard}
        onPaste={event => { if (!active.current) return; event.preventDefault(); send({ action: 'text', text: event.clipboardData.getData('text/plain') }); }}
        onContextMenu={event => { if (controlled) event.preventDefault(); }} />
        {cursorStyle && <div data-testid="browser-cursor" className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-primary/80 shadow-[0_0_0_6px_hsl(var(--primary)/0.18)]" style={cursorStyle}><div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" /></div>}
      </div> : <div className="m-auto px-6 py-8 text-center">
        <MonitorPlay className="mx-auto h-9 w-9 text-neutral-500" />
        <div className="mt-3 text-sm font-medium text-neutral-100">{localizeServerMessage(session.message, t) || t('browserUse.waitingScreenshot')}</div>
        <p className="mt-1 text-xs text-neutral-400">{t('browserUse.waitingScreenshotHint')}</p>
      </div>}
    </div>
  </div>;
}
