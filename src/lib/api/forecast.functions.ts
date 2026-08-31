import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getForecastData } from "./forecast.server";
import type { ForecastResponse } from "./forecast.types";

export const getForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ForecastResponse> => getForecastData());
