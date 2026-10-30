import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserManualSurface } from '@/modules/browser-use/BrowserManualSurface';
import { api } from '@/shared/api';
import type { BrowserUseSession } from '@/shared/types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/shared/ui', () => ({ Button: ({ children, size: _size, variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => <button {...props}>{children}</button> }));
vi.mock('@/shared/api', () => ({ api: { browserUse: { manualInput: vi.fn() } }, readApiJson: (response: unknown) => Promise.resolve(response) }));
const session: BrowserUseSession = { id: 'test', status: 'ready', url: 'https://example.com', title: 'Example', screenshotDataUrl: 'data:image/png;base64,a', createdAt: '', updatedAt: '', lastAction: null, message: null, createdBy: 'agent', profileName: null, viewport: { width: 1440, height: 900 }, cursor: null };
beforeEach(() => {
  vi.mocked(api.browserUse.manualInput).mockReset();
  vi.mocked(api.browserUse.manualInput).mockResolvedValue({ data: { session, tabs: [] } } as unknown as Response);
  window.PointerEvent = MouseEvent as typeof PointerEvent;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
const mount = (overrides: Partial<BrowserUseSession> = {}) => render(<BrowserManualSurface session={{ ...session, ...overrides }} onSession={vi.fn()} fullscreen={false} visible />);
const takeControl = async () => {
  fireEvent.click(screen.getByText('browserUse.manual.take'));
  await screen.findByText('browserUse.manual.release');
};

describe('manual browser surface', () => {
  it('marks where the agent last acted on the screenshot', () => {
    mount({ cursor: { x: 360, y: 450, actor: 'agent' } });
    const cursor = screen.getByTestId('browser-cursor');
    expect(cursor.style.left).toBe('25%');
    expect(cursor.style.top).toBe('50%');
  });
  it('says why there is no screenshot instead of waiting silently', () => {
    mount({ screenshotDataUrl: null, status: 'unavailable', message: 'Chromium could not start.' });
    expect(screen.getByText('Chromium could not start.')).toBeTruthy();
    expect(screen.getByText('browserUse.waitingScreenshotHint')).toBeTruthy();
  });
  it('requires explicit control and maps reduced screenshots to remote coordinates', async () => {
    mount();
    const image = screen.getByLabelText('browserUse.manual.surface');
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 20, left: 10, top: 20, width: 720, height: 450, right: 730, bottom: 470, toJSON: () => ({}) });
    fireEvent.pointerDown(image, { clientX: 370, clientY: 245, button: 0 });
    expect(api.browserUse.manualInput).not.toHaveBeenCalled();
    await takeControl();
    fireEvent.pointerDown(image, { clientX: 370, clientY: 245, button: 0 });
    fireEvent.pointerUp(image, { clientX: 370, clientY: 245, button: 0 });
    await waitFor(() => expect(api.browserUse.manualInput).toHaveBeenCalledWith('test', { action: 'pointer', points: [{ x: 720, y: 450 }] }));
  });
  it('sends unicode and special keys in order and clears the local typing field', async () => {
    mount(); await takeControl();
    const input = screen.getByLabelText('browserUse.manual.keyboard') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Olá 🌿' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('');
    await waitFor(() => expect(api.browserUse.manualInput).toHaveBeenCalledWith('test', { action: 'key', key: 'Tab' }));
    const calls = vi.mocked(api.browserUse.manualInput).mock.calls;
    expect(calls[1][1]).toEqual({ action: 'text', text: 'Olá 🌿' });
    expect(calls[2][1]).toEqual({ action: 'key', key: 'Tab' });
  });
  it('stops queued input after a failed action instead of typing into an unknown field', async () => {
    mount(); await takeControl();
    vi.mocked(api.browserUse.manualInput).mockRejectedValueOnce(new Error('private runtime error'));
    const image = screen.getByLabelText('browserUse.manual.surface');
    fireEvent.keyDown(image, { key: 'a' }); fireEvent.keyDown(image, { key: 'b' });
    await screen.findByText('browserUse.manual.failed');
    expect(screen.queryByText('private runtime error')).toBeNull();
    expect(vi.mocked(api.browserUse.manualInput).mock.calls.some(([, value]) => value.action === 'text' && value.text === 'b')).toBe(false);
  });
});
