import styles from "./loading-block.module.css";

/**
 * Inline loading state for a panel that is fetching its data: bouncing dots, the message, and a few
 * shimmering lines. Made only of spans so it can replace text inside an existing <p> or <div>.
 */
export function LoadingBlock({ label = "Đang tải…", lines = 3 }: { label?: string; lines?: number }) {
  return <span className={styles.block} role="status" aria-live="polite">
    <span className={styles.head}>
      <span className={styles.dots} aria-hidden="true"><span /><span /><span /></span>
      <span className={styles.label}>{label}</span>
    </span>
    {Array.from({ length: lines }, (_, index) => <span key={index} className={styles.line} aria-hidden="true" />)}
  </span>;
}
