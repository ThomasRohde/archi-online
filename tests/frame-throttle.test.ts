import { describe, expect, it, vi } from 'vitest';
import { createFrameThrottle } from '../src/ui/frame-throttle';

describe('animation frame throttle', () => {
  it('publishes only the latest value once per frame and can cancel', () => {
    let callback: FrameRequestCallback | undefined;
    const publish = vi.fn();
    const cancel = vi.fn();
    const throttle = createFrameThrottle(
      publish,
      (next) => {
        callback = next;
        return 7;
      },
      cancel,
    );

    throttle.push({ x: 1, y: 2 });
    throttle.push({ x: 3, y: 4 });
    expect(publish).not.toHaveBeenCalled();
    callback?.(16);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith({ x: 3, y: 4 });

    throttle.push({ x: 5, y: 6 });
    throttle.cancel();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
