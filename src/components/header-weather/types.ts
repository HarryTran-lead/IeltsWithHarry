export type DayPhase = 'earlyMorning' | 'lateMorning' | 'midday' | 'lateAfternoon' | 'sunset' | 'night' | 'lateNight';
export type HeaderDisplayMode = 'full' | 'sky' | 'off';

export type SelectedLocation = {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  source: 'manual' | 'gps';
};

export type WeatherSnapshot = {
  temperatureC: number;
  weatherCode: number;
  isDay: boolean;
  cloudCover: number | null;
  timezone?: string;
  observedAt?: string;
};

export type GeocodingResult = {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};
