import styles from "./harry-wordmark.module.css";

export function HarryWordmark({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`${styles.wordmark} ${dark ? styles.dark : ""}`}>
      <span className={styles.name}>Harry<span className={styles.up}>Up</span></span>
      <span className={styles.tagline}>Level Up Your English.</span>
    </span>
  );
}
