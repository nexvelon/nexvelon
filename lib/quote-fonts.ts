// Registers Cormorant Garamond and Inter with @react-pdf/renderer for use
// in the NEXVELON quote PDF. Imported once by QuoteDocument.tsx.
// Font TTF files live in public/fonts/ — referenced via absolute /fonts/* URLs.

import { Font } from "@react-pdf/renderer";

Font.register({
  family: "Cormorant Garamond",
  fonts: [
    { src: "/fonts/CormorantGaramond-Regular.ttf" },
    { src: "/fonts/CormorantGaramond-Italic.ttf", fontStyle: "italic" },
    { src: "/fonts/CormorantGaramond-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/CormorantGaramond-BoldItalic.ttf", fontWeight: "bold", fontStyle: "italic" },
  ],
});

Font.register({
  family: "Inter",
  fonts: [
    { src: "/fonts/Inter-Regular.ttf" },
    { src: "/fonts/Inter-Medium.ttf", fontWeight: "medium" },
  ],
});
