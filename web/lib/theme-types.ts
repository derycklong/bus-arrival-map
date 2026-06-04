export type HexColor = `#${string}`;
export type RefName = string;
export type Variant = { dark: ColorValue; light: ColorValue };
export type ColorValue = HexColor | RefName | Variant;

export type ColorToken =
  | "primary"
  | "secondary"
  | "accent"
  | "error"
  | "warning"
  | "success"
  | "info"
  | "text"
  | "textMuted"
  | "background"
  | "backgroundPanel"
  | "backgroundElement"
  | "border"
  | "borderActive"
  | "borderSubtle";

export type SyntaxToken =
  | "diffAdded"
  | "diffRemoved"
  | "diffContext"
  | "diffHunkHeader"
  | "diffHighlightAdded"
  | "diffHighlightRemoved"
  | "diffAddedBg"
  | "diffRemovedBg"
  | "diffContextBg"
  | "diffLineNumber"
  | "diffAddedLineNumberBg"
  | "diffRemovedLineNumberBg"
  | "markdownText"
  | "markdownHeading"
  | "markdownLink"
  | "markdownLinkText"
  | "markdownCode"
  | "markdownBlockQuote"
  | "markdownEmph"
  | "markdownStrong"
  | "markdownHorizontalRule"
  | "markdownListItem"
  | "markdownListEnumeration"
  | "markdownImage"
  | "markdownImageText"
  | "markdownCodeBlock"
  | "syntaxComment"
  | "syntaxKeyword"
  | "syntaxFunction"
  | "syntaxVariable"
  | "syntaxString"
  | "syntaxNumber"
  | "syntaxType"
  | "syntaxOperator"
  | "syntaxPunctuation";

export type ThemeToken = ColorToken | SyntaxToken;

export interface ThemeJson {
  $schema?: string;
  defs?: Record<string, HexColor | RefName>;
  theme: Record<ThemeToken, ColorValue> & {
    selectedListItemText?: ColorValue;
    backgroundMenu?: ColorValue;
    thinkingOpacity?: number;
  };
}

export type Mode = "dark" | "light";

export interface ResolvedTheme {
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  text: string;
  textMuted: string;
  background: string;
  backgroundPanel: string;
  backgroundElement: string;
  border: string;
  borderActive: string;
  borderSubtle: string;
  diffAdded: string;
  diffRemoved: string;
  diffContext: string;
  diffHunkHeader: string;
  diffHighlightAdded: string;
  diffHighlightRemoved: string;
  diffAddedBg: string;
  diffRemovedBg: string;
  diffContextBg: string;
  diffLineNumber: string;
  diffAddedLineNumberBg: string;
  diffRemovedLineNumberBg: string;
  markdownText: string;
  markdownHeading: string;
  markdownLink: string;
  markdownLinkText: string;
  markdownCode: string;
  markdownBlockQuote: string;
  markdownEmph: string;
  markdownStrong: string;
  markdownHorizontalRule: string;
  markdownListItem: string;
  markdownListEnumeration: string;
  markdownImage: string;
  markdownImageText: string;
  markdownCodeBlock: string;
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxFunction: string;
  syntaxVariable: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxOperator: string;
  syntaxPunctuation: string;
}

export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  hasLight: boolean;
  hasDark: boolean;
}
