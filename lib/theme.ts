export type ThemeKey =
  | "royal-navy"
  | "onyx-brass"
  | "oxford-green"
  | "burgundy-reserve";

export interface ThemeColors {
  key: ThemeKey;
  name: string;
  description: string;
  primary: string;
  accent: string;
  bg: string;
  text: string;
  card: string;
  border: string;
  muted: string;
  sidebarAccent: string;
  chartTertiary: string;
  chartQuaternary: string;
  /** Five-stop chart palette in stable order — used by Recharts. */
  charts: [string, string, string, string, string];
}

export const THEMES: Record<ThemeKey, ThemeColors> = {
  "royal-navy": {
    key: "royal-navy",
    name: "Royal Navy",
    description: "House default — deep navy with warm gold and ivory linen.",
    primary: "#0B1B3B",
    accent: "#C9A24B",
    bg: "#F8F5EE",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#E5DFD2",
    muted: "#EFEAE0",
    sidebarAccent: "#122752",
    chartTertiary: "#475569",
    chartQuaternary: "#94A3B8",
    charts: ["#0B1B3B", "#C9A24B", "#475569", "#94A3B8", "#1F2937"],
  },
  "onyx-brass": {
    key: "onyx-brass",
    name: "Onyx & Brass",
    description: "Near-black with warm brass — for late-night ops centres.",
    primary: "#1A1A1A",
    accent: "#B5895A",
    bg: "#F1ECE3",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#DCD4C5",
    muted: "#E8E2D6",
    sidebarAccent: "#2A2A2A",
    chartTertiary: "#5C5C5C",
    chartQuaternary: "#A8A8A8",
    charts: ["#1A1A1A", "#B5895A", "#5C5C5C", "#A8A8A8", "#2A2A2A"],
  },
  "oxford-green": {
    key: "oxford-green",
    name: "Oxford Green",
    description: "Deep forest with gold — heritage estate feel.",
    primary: "#0F2A1D",
    accent: "#C9A24B",
    bg: "#F4F1EA",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#DDD7C8",
    muted: "#E8E1D2",
    sidebarAccent: "#163826",
    chartTertiary: "#4A6B5A",
    chartQuaternary: "#8FA89B",
    charts: ["#0F2A1D", "#C9A24B", "#4A6B5A", "#8FA89B", "#1F4A33"],
  },
  "burgundy-reserve": {
    key: "burgundy-reserve",
    name: "Burgundy Reserve",
    description: "Vintage burgundy with gold — boutique private banking.",
    primary: "#3B0D1A",
    accent: "#C9A24B",
    bg: "#F8F5EE",
    text: "#1F2937",
    card: "#FFFFFF",
    border: "#E2D6D9",
    muted: "#EDE2E5",
    sidebarAccent: "#4A1322",
    chartTertiary: "#7A4A55",
    chartQuaternary: "#B89094",
    charts: ["#3B0D1A", "#C9A24B", "#7A4A55", "#B89094", "#5A1828"],
  },
};

export const THEME_ORDER: ThemeKey[] = [
  "royal-navy",
  "onyx-brass",
  "oxford-green",
  "burgundy-reserve",
];

export const DEFAULT_THEME: ThemeKey = "royal-navy";
export const STORAGE_KEY = "nexvelon:theme";

export function isThemeKey(s: string | null): s is ThemeKey {
  return s !== null && (THEME_ORDER as string[]).includes(s);
}
