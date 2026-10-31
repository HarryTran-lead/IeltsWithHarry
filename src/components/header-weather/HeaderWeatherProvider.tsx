'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCurrentWeather } from './weatherApi';
import { deviceTimeZone, phaseAt } from './time';
import { CITY_KEY, MODE_KEY, readManualCity, readMode, saveManualCity, saveMode } from './storage';
import type { DayPhase, HeaderDisplayMode, SelectedLocation, WeatherSnapshot } from './types';

type WeatherContextState = {
  hydrated: boolean;
  mode: HeaderDisplayMode;
  setMode: (mode: HeaderDisplayMode) => void;
  location: SelectedLocation | null;
  chooseCity: (location: SelectedLocation) => void;
  clearCity: () => void;
  requestCurrentLocation: () => Promise<void>;
  locating: boolean;
  locationError: string;
  weather: WeatherSnapshot | null;
  weatherError: string;
  weatherLoading: boolean;
  now: Date | null;
  timezone: string;
  phase: DayPhase;
};

const Context = createContext<WeatherContextState | null>(null);

export function HeaderWeatherProvider({ children, previewPhase = null }: {
  children: ReactNode;
  /** Development/demo only; leave null in production */
  previewPhase?: DayPhase | null;
}) {
  // Initial state is safe for SSR and hydration: only use browser APIs in effects/handlers.
  const [hydrated, setHydrated] = useState(false);
  const [mode, changeMode] = useState<HeaderDisplayMode>('off');
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      changeMode(readMode());
      setLocation(readManualCity());
      setNow(new Date());
      setHydrated(true);
    }, 0);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const refresh = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_KEY || event.key === null) changeMode(readMode());
      if (event.key === CITY_KEY || event.key === null) {
        setLocation(readManualCity());
        setWeather(null);
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setMode = useCallback((next: HeaderDisplayMode) => {
    changeMode(next);
    if (next !== 'full') setWeather(null);
    saveMode(next);
  }, []);

  const chooseCity = useCallback((selected: SelectedLocation) => {
    const manual = { ...selected, source: 'manual' as const };
    setLocation(manual);
    setWeather(null);
    setWeatherError('');
    setLocationError('');
    saveManualCity(manual);
  }, []);

  const clearCity = useCallback(() => {
    setLocation(null);
    setWeather(null);
    setWeatherError('');
    setLocationError('');
    saveManualCity(null);
  }, []);

  const requestCurrentLocation = useCallback((): Promise<void> => {
    setLocationError('');
    if (!('geolocation' in navigator)) {
      setLocationError('Trình duyệt không hỗ trợ định vị. Hãy chọn thành phố thủ công.');
      return Promise.resolve();
    }
    setLocating(true);
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            name: 'Vị trí hiện tại', latitude: Math.round(position.coords.latitude * 100) / 100,
            longitude: Math.round(position.coords.longitude * 100) / 100, source: 'gps',
          });
          // GPS coordinates are rounded (~1 km), sent to the weather provider and NOT persisted locally or on our server.
          saveManualCity(null);
          setWeather(null);
          setWeatherError('');
          setLocating(false);
          resolve();
        },
        (error) => {
          const denied = error.code === 1;
          setLocationError(denied
            ? 'Bạn chưa cấp quyền vị trí. Vẫn có thể chọn thành phố thủ công.'
            : 'Không xác định được vị trí. Hãy thử lại hoặc chọn thành phố.');
          setLocating(false);
          resolve();
        },
        { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 12_000 },
      );
    });
  }, []);

  useEffect(() => {
    if (!hydrated || mode !== 'full' || !location) return;
    let active = true;
    let fetching = false;
    let lastFetch = 0;
    const controller = new AbortController();
    const refreshWeather = async () => {
      if (!active || document.visibilityState !== 'visible' || fetching || Date.now() - lastFetch < 20 * 60_000) return;
      fetching = true;
      lastFetch = Date.now();
      setWeatherLoading(true);
      try {
        const response = await fetchCurrentWeather(location, controller.signal);
        if (!active) return;
        setWeather(response);
        setWeatherError('');
      } catch (error) {
        if (!active || (error instanceof Error && error.name === 'AbortError')) return;
        setWeather(null);
        setWeatherError('Không cập nhật được thời tiết. Hãy thử lại sau.');
      } finally {
        fetching = false;
        if (active) setWeatherLoading(false);
      }
    };
    void refreshWeather();
    // Check once a minute; fetch only after 20 minutes of visible time.
    const timer = window.setInterval(() => void refreshWeather(), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshWeather(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated, location, mode]);

  // A manually selected city uses its IANA time zone; a GPS location uses the returned weather zone.
  const timezone = (location?.source === 'gps' ? weather?.timezone : location?.timezone) || deviceTimeZone();
  const phase = previewPhase || phaseAt(now || new Date('2026-01-01T12:00:00Z'), timezone);

  const state = useMemo<WeatherContextState>(() => ({
    hydrated, mode, setMode, location, chooseCity, clearCity, requestCurrentLocation,
    locating, locationError, weather, weatherError, weatherLoading, now, timezone, phase,
  }), [hydrated, mode, setMode, location, chooseCity, clearCity, requestCurrentLocation,
    locating, locationError, weather, weatherError, weatherLoading, now, timezone, phase]);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useHeaderWeather(): WeatherContextState {
  const state = useContext(Context);
  if (!state) throw new Error('Wrap header in <HeaderWeatherProvider>');
  return state;
}
