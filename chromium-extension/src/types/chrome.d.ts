// Type definitions for chrome.themeColors API

declare namespace chrome {
  export namespace themeColors {
    export interface ThemeColors {
      // Reference colors - Primary palette
      kColorRefPrimary0?: string;
      kColorRefPrimary10?: string;
      kColorRefPrimary20?: string;
      kColorRefPrimary25?: string;
      kColorRefPrimary30?: string;
      kColorRefPrimary40?: string;
      kColorRefPrimary50?: string;
      kColorRefPrimary60?: string;
      kColorRefPrimary70?: string;
      kColorRefPrimary80?: string;
      kColorRefPrimary90?: string;
      kColorRefPrimary95?: string;
      kColorRefPrimary99?: string;
      kColorRefPrimary100?: string;

      // Reference colors - Secondary palette
      kColorRefSecondary0?: string;
      kColorRefSecondary10?: string;
      kColorRefSecondary20?: string;
      kColorRefSecondary30?: string;
      kColorRefSecondary40?: string;
      kColorRefSecondary50?: string;
      kColorRefSecondary60?: string;
      kColorRefSecondary70?: string;
      kColorRefSecondary80?: string;
      kColorRefSecondary90?: string;
      kColorRefSecondary95?: string;
      kColorRefSecondary99?: string;
      kColorRefSecondary100?: string;

      // System colors
      kColorSysPrimary?: string;
      kColorSysOnPrimary?: string;
      kColorSysPrimaryContainer?: string;
      kColorSysOnPrimaryContainer?: string;
      kColorSysSecondary?: string;
      kColorSysOnSecondary?: string;
      kColorSysSurface?: string;
      kColorSysOnSurface?: string;
      kColorSysTonalContainer?: string;
      kColorSysOnTonalContainer?: string;
      kColorSysBaseTonalContainer?: string;
      kColorSysOnBaseTonalContainer?: string;

      // Allow any other color keys
      [key: string]: string | undefined;
    }

    export function get(callback: (colors: ThemeColors) => void): void;

    export namespace onChanged {
      export function addListener(
        callback: (changeInfo: { colors: ThemeColors }) => void
      ): void;
    }
  }
}
