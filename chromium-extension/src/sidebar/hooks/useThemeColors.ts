import { useState, useEffect } from "react";

interface ThemeColors {
  kColorSysBase?: string;
  kColorSysBaseContainer?: string;
  kColorSysOnSurface?: string;
  kColorRefPrimary30?: string;
  kColorSysPrimary?: string;
  kColorSysOnPrimary?: string;
  kColorSysSurface?: string;
  kColorSysTonalContainer?: string;
  kColorSysOnTonalContainer?: string;
  [key: string]: string | undefined;
}

export function useThemeColors() {
  const [colors, setColors] = useState<ThemeColors>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if chrome.themeColors API is available
    if (typeof chrome !== "undefined" && chrome.themeColors) {
      chrome.themeColors.get((themeColors: ThemeColors) => {
        if (themeColors) {
          setColors(themeColors);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  return { colors, loading };
}
