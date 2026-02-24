import React, { useEffect } from "react";
import { useThemeColors } from "../hooks/useThemeColors";

interface ThemeProviderProps {
  children: React.ReactNode;
}

type Rgb = { r: number; g: number; b: number };

function parseColor(value: string | undefined): Rgb | null {
  if (!value) return null;
  const input = value.trim();
  if (!input) return null;

  const hexMatch = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  const rgbMatch = input.match(
    /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i
  );
  if (!rgbMatch && typeof document !== "undefined") {
    const probe = document.createElement("span");
    probe.style.color = input;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    const normalized = computed.match(
      /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i
    );
    if (normalized) {
      const [r, g, b] = normalized.slice(1, 4).map((v) => Number(v));
      if (![r, g, b].some((v) => Number.isNaN(v) || v < 0 || v > 255)) {
        return { r, g, b };
      }
    }
    return null;
  }
  if (!rgbMatch) return null;
  const [r, g, b] = rgbMatch.slice(1, 4).map((v) => Number(v));
  if ([r, g, b].some((v) => Number.isNaN(v) || v < 0 || v > 255)) {
    return null;
  }
  return { r, g, b };
}

function luminance(color: Rgb): number {
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLinear(color.r) +
    0.7152 * toLinear(color.g) +
    0.0722 * toLinear(color.b)
  );
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [bright, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (bright + 0.05) / (dark + 0.05);
}

function pickReadableText(background: string, preferred: string): string {
  const bg = parseColor(background);
  const pref = parseColor(preferred);
  const dark = "#0f172a";
  const light = "#f8fafc";
  const darkRgb = parseColor(dark)!;
  const lightRgb = parseColor(light)!;

  if (!bg) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? light
      : dark;
  }
  if (pref && contrastRatio(bg, pref) >= 4.5) return preferred;
  return contrastRatio(bg, darkRgb) >= contrastRatio(bg, lightRgb)
    ? dark
    : light;
}

function pickBorderColor(background: string): string {
  const bg = parseColor(background);
  if (!bg) return "rgba(15, 23, 42, 0.18)";
  return luminance(bg) >= 0.6
    ? "rgba(15, 23, 42, 0.18)"
    : "rgba(248, 250, 252, 0.22)";
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { colors: themeColors } = useThemeColors();

  // Apply theme colors to CSS variables
  useEffect(() => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const base =
      themeColors.kColorSysBase || (prefersDark ? "#1f1f1f" : "#ffffff");
    const inputBackground =
      themeColors.kColorSysBaseContainer ||
      (prefersDark ? "#2a2b2e" : "#ffffff");
    const preferredText =
      themeColors.kColorSysOnSurface || (prefersDark ? "#ffffff" : "#000000");
    const readableText = pickReadableText(inputBackground, preferredText);
    const borderColor =
      themeColors.kColorSysTonalContainer || pickBorderColor(inputBackground);
    const secondary =
      themeColors.kColorSysSurface ||
      (prefersDark ? "rgba(31, 31, 31, 0.94)" : "rgba(245, 245, 245, 0.96)");

    document.documentElement.style.setProperty("--chrome-bg-primary", base);
    document.documentElement.style.setProperty(
      "--chrome-bg-secondary",
      secondary
    );
    document.documentElement.style.setProperty(
      "--chrome-input-background",
      inputBackground
    );
    document.documentElement.style.setProperty(
      "--chrome-text-primary",
      readableText
    );
    document.documentElement.style.setProperty(
      "--chrome-icon-color",
      readableText
    );
    document.documentElement.style.setProperty(
      "--chrome-input-border",
      borderColor
    );
  }, [themeColors]);

  return <>{children}</>;
};
