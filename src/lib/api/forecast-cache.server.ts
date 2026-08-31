import type { ForecastResponse } from "./forecast.types";

const CACHE_TTL_MS = 15 * 60 * 1000;
let cached: { at: number; value: ForecastResponse } | null = null;

export function getCachedForecast(): ForecastResponse | null {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  return null;
}

export function setCachedForecast(value: ForecastResponse): void {
  cached = { at: Date.now(), value };
}
