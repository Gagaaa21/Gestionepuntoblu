export type PresenceLevel = 0 | 1 | 2 | 3;

export type ForecastDay = {
  date: string;
  weekday: string;
  weatherCode: number;
  tMin: number;
  tMax: number;
  precipMm: number;
  precipProb: number;
  windMax: number;
  uvMax: number;
  /** Temperatura media del mare (°C) — Open-Meteo Marine, opzionale */
  seaTemp?: number;
  /** Altezza massima onde (m) — Open-Meteo Marine, opzionale */
  waveMax?: number;
  /** Copertura nuvolosa media (%) */
  cloudCover?: number;
  /** Ore di sole stimate */
  sunshineHours?: number;
  /** Ponte / long weekend (festivo IT adiacente a weekend) */
  bridge?: boolean;
  presence: PresenceLevel;
  presenceReason: string;
};

export type ForecastResponse = {
  location: string;
  updatedAt: string;
  days: ForecastDay[];
  summary: string;
  sources: string[];
};
