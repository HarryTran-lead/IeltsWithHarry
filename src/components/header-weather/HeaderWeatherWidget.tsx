'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useHeaderWeather } from './HeaderWeatherProvider';
import { searchCities, weatherLabel, weatherSymbol } from './weatherApi';
import { formatLocalClock, PHASE_LABELS } from './time';
import type { GeocodingResult, HeaderDisplayMode } from './types';
import styles from './headerWeather.module.css';

const MODES: { value: HeaderDisplayMode; title: string; detail: string }[] = [
  { value: 'full', title: 'Bầu trời + thời tiết', detail: 'Hiển thị cả hiệu ứng và thông tin thời tiết' },
  { value: 'sky', title: 'Chỉ bầu trời', detail: 'Ẩn nhiệt độ, vẫn đổi màu theo giờ' },
  { value: 'off', title: 'Tắt hoàn toàn', detail: 'Trở về header gốc, không còn hiệu ứng' },
];

/** Place inside existing right header actions, BEFORE streak/tasks/bell/avatar. */
export function HeaderWeatherWidget() {
  const state = useHeaderWeather();
  const { hydrated, mode, setMode, location, chooseCity, clearCity, requestCurrentLocation,
    locating, locationError, weather, weatherLoading, weatherError, now, timezone, phase } = state;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function findCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setSearchError('Nhập ít nhất 2 ký tự để tìm thành phố.');
      return;
    }
    setSearchError('');
    setSearching(true);
    setResults([]);
    try {
      const items = await searchCities(query);
      setResults(items);
      if (items.length === 0) setSearchError('Không tìm thấy thành phố phù hợp.');
    } catch {
      setSearchError('Không tìm được thành phố. Kiểm tra kết nối mạng.');
    } finally { setSearching(false); }
  }

  function pickCity(item: GeocodingResult) {
    chooseCity({
      name: item.name, country: item.country, latitude: item.latitude,
      longitude: item.longitude, timezone: item.timezone, source: 'manual',
    });
    setOpen(false);
    setQuery('');
    setResults([]);
  }

  const textClock = hydrated && now ? formatLocalClock(now, timezone) : '--:--';
  const active = hydrated && mode === 'full';
  const caption = weather ? weatherLabel(weather.weatherCode) : weatherError ? 'Không tải được' : weatherLoading ? 'Đang tải...' : 'Chưa có dữ liệu';

  return (
    <div className={styles.widgetRoot} ref={root}>
      {active && (
        <div className={styles.weatherChip} aria-live="polite">
          <span className={styles.weatherEmoji} aria-hidden="true">{weather ? weatherSymbol(weather.weatherCode, weather.isDay) : '🧭'}</span>
          <div className={styles.weatherText}>
            <strong>{weather ? `${Math.round(weather.temperatureC)}°C` : location ? '--°C' : 'Chọn thành phố'}</strong>
            <span className={styles.cityLabel} title={location?.name || 'Chưa chọn vị trí'}>{location?.name || 'Thời tiết theo vị trí'}</span>
            <span className={styles.metaLine}>{textClock} · {location ? caption : PHASE_LABELS[phase]}</span>
          </div>
        </div>
      )}
      <button
        className={styles.settingsButton}
        type="button"
        aria-label="Cài đặt thời tiết và hiệu ứng header"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Cài đặt hiệu ứng và thời tiết"
        onClick={() => setOpen((value) => !value)}
      >⚙</button>
      {open && (
        <section className={styles.popover} role="dialog" aria-label="Tùy chỉnh header thời tiết">
          <div className={styles.popoverHeading}>
            <div><strong>Thời tiết trên header</strong><small>Chọn cách hiển thị</small></div>
            <button type="button" className={styles.closeButton} aria-label="Đóng cài đặt" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className={styles.modeOptions}>
            {MODES.map((item) => (
              <label className={styles.modeOption} key={item.value}>
                <input type="radio" name="header-weather-mode" checked={mode === item.value} onChange={() => setMode(item.value)} />
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              </label>
            ))}
          </div>
          <div className={styles.locationSection}>
            <strong>Thành phố hiển thị</strong>
            <p>Chỉ hỏi quyền khi bạn bấm nút. Tọa độ GPS được làm tròn, gửi trực tiếp đến Open-Meteo để lấy thời tiết và không được lưu trên thiết bị hay máy chủ của chúng tôi.</p>
            <button className={styles.locationButton} type="button" disabled={locating} onClick={() => void requestCurrentLocation()}>
              {locating ? 'Đang xác định vị trí...' : '◎ Dùng vị trí hiện tại'}
            </button>
            <form className={styles.citySearchForm} onSubmit={(event) => void findCity(event)}>
              <input aria-label="Tìm tên thành phố" placeholder="VD: Hà Nội, Seoul..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <button type="submit" disabled={searching}>{searching ? '...' : 'Tìm'}</button>
            </form>
            {results.length > 0 && (
              <ul className={styles.cityResults}>
                {results.map((item) => (
                  <li key={`${item.id}-${item.latitude}`}><button type="button" onClick={() => pickCity(item)}>
                    <strong>{item.name}</strong><small>{[item.admin1, item.country].filter(Boolean).join(', ')}</small>
                  </button></li>
                ))}
              </ul>
            )}
            {location && <div className={styles.selectedCity}>Đang chọn: <strong>{location.name}</strong>
              <button type="button" onClick={clearCity}>Xóa</button>
            </div>}
            {(locationError || searchError || weatherError) && <p role="status" className={styles.error}>{locationError || searchError || weatherError}</p>}
          </div>
          <div className={styles.credit}>
            Thời tiết: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Không lưu vị trí GPS
          </div>
        </section>
      )}
    </div>
  );
}
