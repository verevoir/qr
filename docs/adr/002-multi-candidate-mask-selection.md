# ADR 002: Multi-Candidate Mask Selection

## Status

Accepted

## Context

The QR specification defines 8 mask patterns. Standard QR libraries apply all 8 masks, score each using the four penalty rules (adjacent runs, 2x2 blocks, finder-like patterns, dark/light ratio), and return only the single mask with the lowest penalty score.

This works well when the QR code will be rendered in one style. But `@verevoir/qr` offers 10 visual styles — and the "best" mask for scanning reliability is not always the most aesthetically pleasing for a given style. A mask that produces clean diagonal lines might look terrible as dots, and vice versa. The choice is subjective and context-dependent.

Two approaches were considered:

1. **Return the single best mask.** Simple API. Consumer has no choice but to accept it. If the result looks bad with their chosen style, they have no recourse.

2. **Return multiple candidates above a quality threshold.** Consumer can preview several options and pick the one that looks best for their use case. Slightly more complex API (returns an array), but gives the consumer meaningful aesthetic control.

## Decision

`encode()` returns **all mask candidates within 30% of the best penalty score**, sorted by penalty ascending. The threshold is configurable via `options.maskThreshold` (default: 1.3).

```typescript
const results = encode('https://example.com');
// results[0] has the lowest penalty (most technically optimal)
// results[1..n] are within 30% — all scan reliably, but look different
```

The first result is always the technically optimal choice. Consumers who don't care about aesthetics can use `results[0]` and ignore the rest.

## Consequences

- **API returns an array, not a single value.** Every consumer must index into the result. This is a minor ergonomic cost but prevents the API from silently discarding useful options.
- **All returned candidates scan reliably.** The 30% threshold is conservative — in practice, penalty score differences within this range have no measurable impact on scanning reliability across tested readers.
- **Style-specific mask selection becomes possible.** The QR Example and QR Links Service apps show all candidates as a selectable grid, letting users pick the mask that looks best with their chosen style.
- **Threshold is tunable.** Consumers who want more variety can raise the threshold. Consumers who want only near-optimal masks can lower it.
