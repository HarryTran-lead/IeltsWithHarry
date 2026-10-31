'use client';
import { useHeaderWeather } from './HeaderWeatherProvider';
import styles from './headerWeather.module.css';

const STAR_POSITIONS = [
  [5, 17], [12, 48], [20, 12], [27, 64], [35, 30], [44, 78],
  [54, 19], [62, 53], [70, 13], [77, 74], [83, 27], [92, 49],
];

/** Decorative only. This layer never intercepts clicks or changes the navigation. */
export function HeaderSkyBackdrop() {
  const { mode, phase, hydrated } = useHeaderWeather();
  if (!hydrated || mode === 'off') return null;
  const phaseClass = {
    morning: styles.morning, afternoon: styles.afternoon,
    evening: styles.evening, lateNight: styles.lateNight,
  }[phase];
  return (
    <div className={`${styles.skyBackdrop} ${phaseClass}`} aria-hidden="true">
      <div className={styles.skyGlow} />
      <div className={styles.sunMoon} />
      <div className={`${styles.cloud} ${styles.cloudOne}`} />
      <div className={`${styles.cloud} ${styles.cloudTwo}`} />
      <div className={styles.stars}>
        {STAR_POSITIONS.map(([x, y], index) => (
          <span key={index} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${index * 0.28}s` }} />
        ))}
      </div>
      <svg className={styles.skyline} viewBox="0 0 1200 85" preserveAspectRatio="xMidYMax slice" focusable="false">
        <path className={styles.skylineFar} d="M0 70V62h35V48h13V64h27V57h24V40h13v22h18V51h16V35h13v30h30V49h19v11h27V41h21v20h17V50h22V38h10v23h25V45h18v17h20V31h17v30h18V48h21v15h21V39h27v25h22V55h20V41h15v22h19V29h20v35h23V49h19v15h22V34h16v30h19V51h28v13h21V43h18v20h24V37h19v26h21V48h26v15h19V54h21V39h17v24h19V46h31v18h28V43h17v21h15V50h24v15h23V42h19v21h16V53h19v16h33V44h21v23h18V58h20v15h43v12H0z" />
        <path className={styles.skylineNear} d="M0 85V75h45V59h28v26h21V66h17v19h27V53h18v32h30V68h30v17h27V63h16v22h21V52h28v33h36V61h20v24h20V50h31v35h17V69h28v16h21V56h15v29h34V62h20v23h32V48h21v37h18V59h24v26h25V67h19v18h28V52h18v33h25V67h29v18h18V58h25v27h30V62h19v23h21V55h27v30h24V68h19v17h23V57h30v28h26V69h23v16h22V52h18v33h22V64h26v21h20V56h32v29h21V71h27v14z" />
      </svg>
    </div>
  );
}
