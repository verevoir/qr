export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

export type SvgStyle =
  | 'square'
  | 'dots'
  | 'diamonds'
  | 'horizontal'
  | 'vertical'
  | 'diagonal'
  | 'network'
  | 'circuit'
  | 'metro'
  | 'scribble'
  | 'photo'
  | 'logo'
  | 'color-logo';

export type CornerStyle = 'square' | 'rounded';

export type LineWidth = 'normal' | 'thin';

export interface SvgColor {
  /** Colour of the dark modules. Any CSS colour string. Default `#000`. */
  dark?: string;
  /**
   * Colour of the light modules (finder pattern inner rect, dots-style
   * light layer, etc.). Default `#fff`. Pass `'transparent'` to let
   * the page background show through.
   */
  light?: string;
  /**
   * Optional background colour — emits a full-size `<rect>` as the
   * first child of the `<svg>`. Distinct from `light` so you can have
   * a dark background without colouring light module features.
   */
  background?: string;
}

export interface PhotoSample {
  /** 0 = black, 1 = white. Drives dot diameter for `photo`. */
  luminance: number;
  /**
   * Optional CSS colour the renderer should emit at this cell.
   * `color-logo` consumes this — the convention there is to emit
   * the pure hue (HSV with S=1, V=1) of the sampled pixel, or a
   * neutral fallback (e.g. `#000`) for achromatic pixels.
   */
  color?: string;
  /**
   * Optional 0–1 visual weight of the source pixel — drives the
   * `color-logo` dot diameter. Convention: `max(1 − V, S × V)` over
   * HSV, so vivid hues, deep darks, and dark-muted colours all get
   * larger dots; pale tints and white pixels get smaller. Defaults
   * to `1 − luminance` if omitted, matching the photo-style sizing.
   */
  prominence?: number;
  /**
   * Optional 0–1 luminance of the *emitted* `color` (not the source
   * pixel — see `luminance` for that). `color-logo` reads this to
   * decide whether to drop a small dark anchor inside a coloured
   * dot when the emitted hue is too light to read as a dark module.
   */
  colorLuminance?: number;
}

/**
 * Curried sampler: the renderer calls the outer function once with the
 * final matrix size (so consumers can rasterise their source image to a
 * `size × size` canvas once and cache it), then calls the inner function
 * per module to read luminance. Library stays free of DOM and canvas
 * dependencies — all image work happens in the consumer's closure.
 */
export type PhotoSampler = (
  size: number,
) => (row: number, col: number) => PhotoSample;

export interface PhotoOptions {
  sample: PhotoSampler;
  /**
   * Minimum dot diameter (in module units) for dark modules. Floors the
   * modulation so dark modules sitting in very light image regions still
   * scan. Default `0.25`.
   */
  minDotSize?: number;
  /**
   * Maximum dot diameter (in module units). Default `0.9` — matches the
   * regular `dots` style at full size.
   */
  maxDotSize?: number;
  /**
   * Light modules are culled when the sample luminance is decisively
   * light — above this threshold. Without the cull, the small white
   * centre dots would render over already-light image regions and
   * clutter the look. Default `0.7`, mirroring `LogoOptions`.
   */
  lightAbove?: number;
}

export interface LogoOptions {
  sample: PhotoSampler;
  /**
   * Dark modules are culled (the image itself provides the dark pixel)
   * only when the sample luminance is decisively dark — below this
   * threshold. Default `0.4`, aligning with the ISO/IEC 15415 dark
   * reflectance ceiling.
   */
  darkBelow?: number;
  /**
   * Light modules are culled only when the sample luminance is decisively
   * light — above this threshold. Default `0.7`, aligning with the
   * ISO/IEC 15415 light reflectance floor. Luminance in the mushy band
   * `[darkBelow, lightAbove]` always gets a dot, regardless of module.
   */
  lightAbove?: number;
}

export interface SvgOptions {
  style?: SvgStyle;
  cornerStyle?: CornerStyle;
  lineWidth?: LineWidth;
  /**
   * Colour controls. Implemented via the `color` attribute on the SVG
   * root plus the `--qr-light` CSS custom property, so child elements
   * inherit naturally — no per-element colour plumbing required.
   */
  color?: SvgColor;
  /**
   * Required when `style: 'photo'`. Drives dark-dot diameter from a
   * per-module luminance sampler — darker regions get bigger dots,
   * lighter regions smaller. Light modules in dark regions render as a
   * dark ring with a light centre for the decoder to sample. Finder and
   * alignment patterns always render full-size regardless of luminance.
   */
  photo?: PhotoOptions;
  /**
   * Required when `style: 'logo'`. Overlays the bare minimum of dots on
   * top of a source image the consumer composites behind the SVG: each
   * module is rendered only where the image's luminance disagrees with
   * the module's value (confidently). Where the image is already
   * providing the right contrast, no dot is emitted. Finder and
   * alignment patterns always render full-size.
   */
  logo?: LogoOptions;
  /**
   * Required when `style: 'color-logo'`. Same dot-density modulation
   * as `photo`, but each dot uses the colour the sampler returns at
   * that cell instead of black. When the sampled colour is light
   * enough to potentially read as a "light" module, a small dark
   * centre is added to anchor the decoder — mirroring the white
   * centre `photo` uses for light modules in dark image regions.
   */
  colorLogo?: PhotoOptions;
}

export interface QrMatrix {
  readonly matrix: ReadonlyArray<Uint8Array>;
  readonly size: number;
  readonly dataMatrix: ReadonlyArray<Uint8Array>;
  readonly fixedMatrix: ReadonlyArray<Uint8Array>;
  readonly finderCoordinates: ReadonlyArray<readonly [number, number]>;
  readonly alignmentCoordinates: ReadonlyArray<readonly [number, number]>;
}

export interface QrResult extends QrMatrix {
  readonly version: number;
  readonly errorLevel: ErrorLevel;
  readonly maskIndex: number;
  readonly penalty: number;
}

export interface EncodeOptions {
  /**
   * Minimum error correction level. The encoder tries the highest level that
   * fits (H→Q→M→L) at the minimum required version, so the actual level may
   * be higher than specified. Default: `'L'`.
   */
  minErrorLevel?: ErrorLevel;
  /**
   * When `true`, guarantees H-level error correction even if it requires a
   * larger QR version than the data alone would need. Useful for stylised
   * renderings (dots, scribble, etc.) where scanning conditions are harder.
   * Equivalent to `minErrorLevel: 'H'`.
   */
  boostErrorCorrection?: boolean;
  /**
   * Reserves capacity for a logo covering this fraction of the matrix
   * area, between 0 and (exclusive) 1. Forces H-level error correction
   * and bumps the version until the data occupies at most `1 - logoArea`
   * of the available bytes — the covered modules then stay within the
   * error-correction recovery budget when a logo is composited over the
   * centre. Recommended range: `0.05`–`0.25`. Values above ~0.30 will
   * usually fail to produce a scannable code because they exceed H's
   * recovery capacity. If no version can accommodate the data at the
   * requested ratio, `encode` throws `"content is too large"`.
   */
  logoArea?: number;
  threshold?: number;
}
