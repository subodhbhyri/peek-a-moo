# Find the moon

Point your phone at the sky. When it's aimed at the real Moon, the Moon shows up on screen — and is mildly embarrassed about it.

Built with Angular 21, `astronomy-engine` (topocentric ephemeris), and `geomagnetism` (WMM2025 magnetic declination). No backend — your location never leaves your device.

Full build plan and phase-by-phase status: [PLAN.md](./PLAN.md)

## 1. Setup

```bash
npm install
npm start          # http://localhost:4200
```

Add `?debug` to the URL for a live sensor readout (raw orientation values, calibration offset, computed vs. pointed-at Moon position). You'll want this open on your phone for the checks below.

## 2. Test before you touch a phone

```bash
npm run format:check   # Prettier
npm run lint            # ESLint
npm test -- --watch=false   # 64 unit tests
npm run build            # production build
```

All four should pass clean. CI (`.github/workflows/ci.yml`) runs the same four steps on every push and PR once this is on GitHub.

## 3. Test on a real phone

Browser sensors (motion, orientation, geolocation) require HTTPS, so `localhost` on your laptop won't let a *phone* provide sensor data — but you can still open `localhost:4200` on the laptop itself and fake sensors via Chrome DevTools → More tools → Sensors, which is a fast way to sanity-check things before deploying.

For the real thing, you need an HTTPS URL your phone can reach. The easiest path is a Vercel preview:

1. Push this repo to GitHub.
2. Import it in Vercel ([vercel.com/new](https://vercel.com/new)). Framework preset: **Angular**. It should auto-detect the output directory from `vercel.json` (`dist/find-the-moon/browser`) — if it asks, set that manually.
3. Every push gets a preview URL like `find-the-moon-xyz.vercel.app`. Open that on your phone.

**On your phone, in this order:**

1. **Open the debug view** (`?debug` in the URL) first, before anything else, so you can see numbers while you test.
2. **Grant permissions.** On iOS you'll get a "Tap anywhere to begin" screen — tap it, then allow both the motion and location prompts. On Android it should start immediately.
3. **Check `pointing az`** in the debug overlay against a real compass app. They should differ by roughly the `decl` value shown (your local magnetic declination) — if they match exactly with no declination applied, something's wrong with the correction.
4. **Tilt between flat and upright** (iOS only) and watch `ios offset` / `spread` in the debug overlay. `spread` should stay close to 0. If it drifts as you tilt, the heading-source assumption in `referenceHeading()` (in `core/sensors/orientation-math.ts`) doesn't hold for your phone and needs a tweak — see the comment on that function for what to change.
5. **Rotate to landscape** and back. The Moon should stay in the same real-world spot on screen throughout, not jump.
6. **Go outside and actually point at the Moon.** This is the real test. The drawn Moon should sit right on top of the real one. If it's consistently off in one direction:
   - Off left/right → check declination and heading first (steps 3–4)
   - Off up/down → check location accuracy, then the vFOV feel parameter (`V_FOV_DEG` in `sky-view.ts`) — this one only affects speed/difficulty, not accuracy, so a vertical offset is more likely a location or altitude issue
7. **Let it find you.** Center the Moon and hold still for under a second — you should get a face, a line of dialogue, a corner toast ("Found the moon in X.Xs 🌘"), and (Android) a short vibration.
8. **Try the fallbacks deliberately:**
   - Deny location when prompted → a "Set location" chip should appear; tap it and search for your city
   - On a laptop/desktop browser (no orientation sensors) → after ~2.5s you should see a "drag the sky instead" hint, and dragging the canvas should move the view
   - Deny motion on iOS → should show a clear "reload and allow" message
9. **Tap the camera toggle** (top-right) to confirm the environment-facing camera feed shows up behind the sky. Known limitation: the field of view isn't calibrated to the real camera's FOV yet, so treat this as a fun visual layer, not a precise AR overlay.
10. **Leave it idle for 20+ seconds while searching** (don't find the Moon) — a faint glow should appear at the screen edge nearest the Moon's direction.

## 4. Before deploying for real

- Pick a name/domain (a few ideas are in PLAN.md) and connect it in Vercel's project settings.
- If you want analytics, add Vercel Analytics or Plausible now — this was deliberately left out since it needs your account, and the plan only asks for anonymous events (found, find-time bucket, platform), never location.
- Consider recording a short screen capture for the README/portfolio once you've confirmed it works outside.

## 5. Deploy

Once everything above checks out:

```bash
git add -A
git commit -m "Find the moon"
git push
```

Vercel auto-deploys the `main` branch to production on push. Nothing else to configure — `vercel.json` already points at the right build output.
