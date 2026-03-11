# @verevoir/qr — Intent

## Why

Most QR code generators produce bitmaps and offer no control over visual style. This package generates vector SVG output with multiple artistic rendering styles, making it suitable for print, 3D fabrication, laser cutting, and web display.

The encoding engine was originally built from scratch as a learning exercise to understand the QR specification (ISO/IEC 18004). Bringing it into the Verevoir ecosystem makes it available as a composable library alongside commerce, bookings, and tracking.

## Key Decisions

- **Zero dependencies** — pure TypeScript, no native modules, runs anywhere.
- **SVG output** — vector by default, not bitmap. Enables scaling, styling, and post-processing.
- **Multi-candidate selection** — instead of always picking the single "best" mask, returns several good options so consumers can choose aesthetically.
- **Separate layers** — the dots renderer can output dark/light/background as separate SVG groups for fabrication workflows.
- **Library, not service** — the QR engine is a dependency in the consumer's app, not a hosted API.
