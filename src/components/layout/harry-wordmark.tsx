import styles from "./harry-wordmark.module.css";

export function HarryWordmark({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className={`${styles.wordmark} ${dark ? styles.dark : ""} ${compact ? styles.compact : ""}`}>
      <span className={styles.name}>Harry<span className={styles.up}>Up</span></span>
      {!compact && <span className={styles.tagline}>Level Up Your English.</span>}
    </span>
  );
}
