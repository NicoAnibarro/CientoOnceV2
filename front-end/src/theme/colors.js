export const APP_THEMES = {
  verde: {
    label: "Verde crema",
    swatches: ["#3CB371", "#FFFAF0", "#FFFFFF"],
    colors: {
      background: "#FFFAF0",
      surface: "#FFFFFF",
      primary: "#3CB371",
      primaryDark: "#278653",
      primarySoft: "#E8F7EF",
      text: "#111111",
      textSecondary: "#6B6B6B",
      border: "#DDE8E1",
      accent: "#F4C430",
      danger: "#C7463B",
      dangerSoft: "#FCEBE9",
      disabled: "#BDBDBD",
      black: "#000000",
    },
  },
  rojo: {
    label: "Rojo, negro y gris",
    swatches: ["#C62828", "#171717", "#ECECEC"],
    colors: {
      background: "#F5F5F5",
      surface: "#FFFFFF",
      primary: "#C62828",
      primaryDark: "#8E1717",
      primarySoft: "#FBE9E9",
      text: "#171717",
      textSecondary: "#666666",
      border: "#E1D6D6",
      accent: "#202020",
      danger: "#A51616",
      dangerSoft: "#FCE8E8",
      disabled: "#BDBDBD",
      black: "#000000",
    },
  },
  azul: {
    label: "Azul claro y blanco",
    swatches: ["#2878C8", "#DDEFFF", "#FFFFFF"],
    colors: {
      background: "#F3F9FF",
      surface: "#FFFFFF",
      primary: "#2878C8",
      primaryDark: "#155A9C",
      primarySoft: "#E3F1FF",
      text: "#102337",
      textSecondary: "#607286",
      border: "#D5E5F3",
      accent: "#48A9E6",
      danger: "#C7463B",
      dangerSoft: "#FCEBE9",
      disabled: "#B8C2CC",
      black: "#000000",
    },
  },
  tierra: {
    label: "Tierra artesanal",
    swatches: ["#B85C3B", "#F5E8D5", "#FFFFFF"],
    colors: {
      background: "#FBF5EC",
      surface: "#FFFFFF",
      primary: "#B85C3B",
      primaryDark: "#813D28",
      primarySoft: "#F7E2D8",
      text: "#3E2A21",
      textSecondary: "#79665D",
      border: "#E8D8CC",
      accent: "#D59B45",
      danger: "#B13C32",
      dangerSoft: "#FBE9E6",
      disabled: "#C2B6AE",
      black: "#000000",
    },
  },
  violeta: {
    label: "Violeta moderno",
    swatches: ["#7357B5", "#EEE8FA", "#FFFFFF"],
    colors: {
      background: "#F8F5FD",
      surface: "#FFFFFF",
      primary: "#7357B5",
      primaryDark: "#513A8C",
      primarySoft: "#EEE8FA",
      text: "#211A2F",
      textSecondary: "#70677E",
      border: "#E1D9EC",
      accent: "#B16EA5",
      danger: "#BF4141",
      dangerSoft: "#FBE9E9",
      disabled: "#BDB7C5",
      black: "#000000",
    },
  },
};

const colors = { ...APP_THEMES.verde.colors };
const listeners = new Set();

export function applyAppTheme(key) {
  const selected = APP_THEMES[key] ? key : "verde";
  Object.assign(colors, APP_THEMES[selected].colors);
  listeners.forEach((listener) => listener());
  return selected;
}

export function registerThemeListener(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default colors;
