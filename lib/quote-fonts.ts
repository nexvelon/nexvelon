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
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${basePath}/Inter-Regular.ttf` },
      { src: `${basePath}/Inter-Medium.ttf`, fontWeight: "medium" },
    ],
  });
}

if (typeof window !== "undefined") {
  registerQuoteFonts();
}
