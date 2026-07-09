// Registers Cormorant Garamond and Inter with @react-pdf/renderer.
// Browser: auto-registers from /fonts/*.ttf at module load.
// Node (smoke scripts, server rendering): caller must invoke
// registerQuoteFonts(absolutePath) explicitly with the filesystem path.

import { Font } from "@react-pdf/renderer";

export function registerQuoteFonts(basePath: string = "/fonts") {
  Font.register({
    family: "Cormorant Garamond",
    fonts: [
      { src: `${basePath}/CormorantGaramond-Regular.ttf` },
      { src: `${basePath}/CormorantGaramond-Italic.ttf`, fontStyle: "italic" },
      { src: `${basePath}/CormorantGaramond-Bold.ttf`, fontWeight: "bold" },
      { src: `${basePath}/CormorantGaramond-BoldItalic.ttf`, fontWeight: "bold", fontStyle: "italic" },
    ],
  });
  // BUGFIX — added Light (300) + Bold (700) so the quote PDF can render real
  // weight distinctions: T&C body in Inter Light (genuine thin strokes, not an
  // opacity dim), and rich-text bold marks in Inter Bold (vs regular 400).
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${basePath}/Inter-Light.ttf`, fontWeight: 300 },
      { src: `${basePath}/Inter-Regular.ttf`, fontWeight: 400 },
      { src: `${basePath}/Inter-Medium.ttf`, fontWeight: 500 },
      { src: `${basePath}/Inter-Bold.ttf`, fontWeight: 700 },
    ],
  });
}

if (typeof window !== "undefined") {
  registerQuoteFonts();
}
