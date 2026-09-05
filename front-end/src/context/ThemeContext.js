import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../api/api";
import { useAuth } from "./AuthContext";
import { applyAppTheme, APP_THEMES } from "../theme/colors";

const ThemeContext = createContext();

export const useAppTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const { session } = useAuth();
  const [theme, setThemeState] = useState("verde");
  const [revision, setRevision] = useState(0);

  const apply = useCallback((key) => {
    const selected = applyAppTheme(key);
    setThemeState(selected);
    setRevision((current) => current + 1);
    return selected;
  }, []);

  useEffect(() => {
    if (!session) {
      apply("verde");
      return;
    }
    api
      .get("/configuracion-comercial/paleta-app")
      .then((response) => apply(response.data.data?.paleta_app || "verde"))
      .catch(() => apply("verde"));
  }, [session?.usuario?.id_usuario, apply]);

  const saveTheme = async (key) => {
    const selected = apply(key);
    try {
      await api.patch("/configuracion-comercial/paleta-app", {
        paleta_app: selected,
      });
    } catch (error) {
      apply(theme);
      throw error;
    }
  };

  return (
    <ThemeContext.Provider
      value={{ theme, themes: APP_THEMES, saveTheme, revision }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
