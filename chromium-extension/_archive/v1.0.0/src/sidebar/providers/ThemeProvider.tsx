import React, { useEffect } from "react";
import { useThemeColors } from "../hooks/useThemeColors";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { colors: themeColors } = useThemeColors();

  // Apply theme colors to CSS variables
  useEffect(() => {
    if (themeColors.kColorSysBase) {
      document.documentElement.style.setProperty(
        "--chrome-bg-primary",
        themeColors.kColorSysBase
      );
    }
    if (themeColors.kColorSysOnSurface) {
      document.documentElement.style.setProperty(
        "--chrome-text-primary",
        themeColors.kColorSysOnSurface
      );
      document.documentElement.style.setProperty(
        "--chrome-icon-color",
        themeColors.kColorSysOnSurface
      );
    }
    if (themeColors.kColorSysBaseContainer) {
      document.documentElement.style.setProperty(
        "--chrome-input-background",
        themeColors.kColorSysBaseContainer
      );
      document.documentElement.style.setProperty(
        "--chrome-input-border",
        themeColors.kColorSysBaseContainer
      );
    }
  }, [themeColors]);

  return <>{children}</>;
};
