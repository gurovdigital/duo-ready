# Fold geometry and the evidence behind it

Collected 11-13 September 2026, two to four days after Apple announced iPhone Duo.
Recheck when Xcode 27.1 ships the iPhone Duo simulator and when Safari 27.1 ships.

## iPhone Duo

| | Closed (outer display) | Opened (inner display) |
|---|---|---|
| Diagonal | 5.4 in | 7.6 in |
| Panel | 1398 x 2034 px, 460 ppi | 1878 x 2670 px, 430 ppi |
| Points at 3x | 466 x 678 | 626 x 890 from the panel; 669 x 951 from App Store Connect |
| Crease | none | vertical, at the horizontal centre |

- Announced 9 September 2026. Pre-orders 16 October, on sale 23 October, ships
  with iOS 27.1. From $1,999; from €2,299 in Germany.
- The two opened sizes disagree. App Store Connect asks for 2007 x 2853 px inner
  screenshots, which is 669 x 951 points at 3x; the spec sheet panel gives 626 x
  890. Audit both until a device or Apple's simulator settles it.
- The fold is book-style: the closed width (466) roughly doubles when opened, so
  the crease sits at the centre of the opened width.
- On the outer display the Dynamic Island stands vertically along one side, so
  side safe-area insets are no longer equal. A full-bleed fixed bar should carry
  `padding-left: env(safe-area-inset-left, 0px)` and the right-hand equivalent.

## What Apple tells developers

- The inner display is regular width and regular height at every pose, and does
  not honour supported interface orientations: use size, not orientation.
- Controls must stay out of the crease; sheets, alerts, menus and toolbar buttons
  are moved away from it by the system. Continuous scrolling content is not.
- Native apps get the crease as `UIViewReservedRegion` / `ReservedRegion` in the
  iOS 27.1 SDK. There is no web equivalent.

## The web platform

- Viewport Segments (`env(viewport-segment-width 0 0)`,
  `@media (horizontal-viewport-segments: 2)`) and Device Posture
  (`@media (device-posture: folded)`) ship in Chromium-based browsers on Android
  and Windows. WebKit has not shipped either as of Safari 27 beta; its standards
  positions on both are still open.
- So on iOS a page can only infer the fold from the viewport width.

## In-app browsers on iOS

Measured on iOS 26.5 with `viewport-fit=cover`, in Safari and in a WKWebView host
with a 96-point translucent toolbar standing in for an app's in-app browser:

| | Safari | In-app WKWebView |
|---|---|---|
| `env(safe-area-inset-top)` | 0px | 62px |
| `env(safe-area-inset-bottom)` | 0px | 34px |
| `innerHeight` / `clientHeight` | 714 / 714 | 778 / 874 |

A fixed header padded by the top inset gains nothing in Safari and a 62px dead
strip in the in-app view. Write `env()` inline in each declaration rather than
through a custom property; some WebKit builds fail that substitution and drop
the whole declaration.

## Sources

- Apple, "Apple unveils iPhone Duo": https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/
- Apple, iPhone Duo technical specifications: https://www.apple.com/iphone-duo/specs/
- Apple Developer, "Prepare your app for iPhone Duo": https://developer.apple.com/videos/play/tech-talks/111461/
- MacRumors, "Apple Details How iOS 27 Adapts to iPhone Duo's Displays": https://www.macrumors.com/2026/09/10/apple-details-how-ios-27-adapts-to-iphone-duo/
- Blake Crosley, "iPhone Duo, Day Two": https://blakecrosley.com/blog/iphone-duo-day-two
- WebKit standards position, Viewport Segments: https://github.com/WebKit/standards-positions/issues/327
- WebKit standards position, Device Posture: https://github.com/WebKit/standards-positions/issues/328
- YesViz, Galaxy Z Fold 7 viewport: https://yesviz.com/devices/samsung-z-fold7/
