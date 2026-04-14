export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

export type SvgStyle =
  | 'square'
  | 'dots'
  | 'horizontal'
  | 'vertical'
  | 'diagonal'
  | 'grid'
  | 'lines'
  | 'metro'
  | 'scribble'
  | 'scribble-alt'
  | 'outline'
  | 'outline-round'
  | 'outline-diagonal'
  | 'outline-round-diagonal';

export type CornerStyle = 'square' | 'rounded' | 'round';

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
  threshold?: number;
}
