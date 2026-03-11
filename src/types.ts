export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

export type SvgStyle =
  | 'square'
  | 'dots'
  | 'horizontal'
  | 'vertical'
  | 'diagonal'
  | 'grid'
  | 'tubemap'
  | 'metro';

export type CornerStyle = 'square' | 'rounded' | 'round';

export type LineWidth = 'normal' | 'thin';

export interface SvgOptions {
  style?: SvgStyle;
  cornerStyle?: CornerStyle;
  lineWidth?: LineWidth;
  layers?: boolean;
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
  minErrorLevel?: ErrorLevel;
  threshold?: number;
}
