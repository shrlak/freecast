import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { END_HOLD_MS, holdToConfirm } from '../src/domain/holdToConfirm';

describe('continuous hold to end a presentation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('a tap or a hold shorter than a full second cannot end the presentation', () => {
    const end = vi.fn(), holding = vi.fn(), g = holdToConfirm(end, holding);
    g.start(); vi.advanceTimersByTime(END_HOLD_MS - 1); g.cancel(); vi.advanceTimersByTime(5000);
    expect(end).not.toHaveBeenCalled(); expect(holding.mock.calls).toEqual([[true], [false]]);
  });
  it('fires once after one second even when keyboard auto-repeat attempts to restart it', () => {
    const end = vi.fn(), g = holdToConfirm(end, () => {});
    g.start(); vi.advanceTimersByTime(500); g.start(); vi.advanceTimersByTime(500);
    expect(end).toHaveBeenCalledOnce(); vi.advanceTimersByTime(5000); g.cancel(); expect(end).toHaveBeenCalledOnce();
  });
  it('separate short holds do not accumulate and a later complete hold can succeed', () => {
    const end = vi.fn(), g = holdToConfirm(end, () => {});
    g.start(); vi.advanceTimersByTime(700); g.cancel(); g.start(); vi.advanceTimersByTime(700);
    expect(end).not.toHaveBeenCalled(); vi.advanceTimersByTime(300); expect(end).toHaveBeenCalledOnce();
  });
  it('rechecks readiness at the deadline and does not fire after disconnect, loss of control or becoming hidden', () => {
    let ready = true; const end = vi.fn(), g = holdToConfirm(end, () => {}, () => ready);
    g.start(); vi.advanceTimersByTime(500); ready = false; vi.advanceTimersByTime(5000);
    expect(end).not.toHaveBeenCalled();
    g.start(); ready = true; vi.advanceTimersByTime(5000); expect(end).not.toHaveBeenCalled();
    g.start(); vi.advanceTimersByTime(1000); expect(end).toHaveBeenCalledOnce();
  });
  it('cancellation or unmount clears pending timers without a late command', () => {
    const end = vi.fn(), g = holdToConfirm(end, () => {});
    g.start(); g.cancel(); g.start(); g.dispose(); vi.advanceTimersByTime(5000);
    expect(end).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
