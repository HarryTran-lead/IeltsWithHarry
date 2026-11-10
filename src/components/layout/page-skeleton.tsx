import styles from "./page-skeleton.module.css";

/**
 * Placeholder shaped like a typical learner page (heading, summary strip, card grid) with a soft
 * shimmer, shown while a section's code or data loads so the screen never looks frozen.
 */
export function PageSkeleton({ label = "Đang tải…" }: { label?: string }) {
  return <div className={`content-page ${styles.page}`} role="status" aria-live="polite" aria-busy="true">
    <span className={styles.label}>{label}</span>
    <div className={styles.head} aria-hidden="true">
      <span className={`${styles.bone} ${styles.eyebrow}`} />
      <span className={`${styles.bone} ${styles.title}`} />
      <span className={`${styles.bone} ${styles.text}`} />
    </div>
    <div className={styles.strip} aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <span key={index} className={`${styles.bone} ${styles.stat}`} />)}
    </div>
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.card}>
        <span className={`${styles.bone} ${styles.icon}`} />
        <span className={`${styles.bone} ${styles.line}`} />
        <span className={`${styles.bone} ${styles.line} ${styles.short}`} />
      </div>)}
    </div>
  </div>;
}

/** Full learner frame (header, sidebar, page) for route-level loading before the real shell mounts. */
export function ShellSkeleton({ label }: { label?: string }) {
  return <div className="app-frame">
    <header className={`topbar ${styles.topbar}`} aria-hidden="true">
      <span className={`${styles.bone} ${styles.brand}`} />
      <span className={`${styles.bone} ${styles.search}`} />
      <span className={styles.spacer} />
      <span className={`${styles.bone} ${styles.pill}`} />
      <span className={`${styles.bone} ${styles.avatar}`} />
    </header>
    <aside className={`sidebar ${styles.sidebar}`} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <span key={index} className={`${styles.bone} ${styles.nav}`} />)}
    </aside>
    <main className="main-area"><PageSkeleton label={label} /></main>
  </div>;
}
