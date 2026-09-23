/**
 * iOS Safari (13+) only delivers deviceorientation events after
 * DeviceOrientationEvent.requestPermission() resolves 'granted', and that call is ONLY allowed
 * synchronously inside a user gesture (tap/click). Android Chrome and desktop don't need it.
 *
 * So the first-run flow is:
 *   - needsMotionPermissionGesture() === false  -> start immediately on page load (no tap)
 *   - needsMotionPermissionGesture() === true   -> "tap anywhere" and call requestMotionPermission()
 *     as the FIRST statement of the tap handler (no `await` before it, or iOS rejects the call).
 */

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>;

interface IOSDeviceOrientationEvent {
  requestPermission?: PermissionFn;
}

export type MotionPermission = 'granted' | 'denied' | 'not-required' | 'unsupported';

export function hasOrientationApi(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

export function needsMotionPermissionGesture(): boolean {
  if (!hasOrientationApi()) return false;
  const ctor = window.DeviceOrientationEvent as unknown as IOSDeviceOrientationEvent;
  return typeof ctor.requestPermission === 'function';
}

/** Must be called synchronously from a user-gesture handler on iOS. */
export function requestMotionPermission(): Promise<MotionPermission> {
  if (!hasOrientationApi()) return Promise.resolve('unsupported');
  const ctor = window.DeviceOrientationEvent as unknown as IOSDeviceOrientationEvent;
  if (typeof ctor.requestPermission !== 'function') return Promise.resolve('not-required');
  // Kick off the request immediately — this line must run inside the gesture's call stack.
  return ctor
    .requestPermission()
    .then((r): MotionPermission => (r === 'granted' ? 'granted' : 'denied'))
    .catch((): MotionPermission => 'denied');
}
