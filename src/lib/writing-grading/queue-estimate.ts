/** A conservative display estimate until we have enough measured grading latency. */
export function queueEstimate(olderPending: number) {
  const ahead = Math.max(0, Math.floor(olderPending));
  // Cloudflare jobs can run concurrently, but the number of active requests varies.
  const batches = Math.ceil((ahead + 1) / 2);
  return { ahead, minMinutes: Math.max(1, batches), maxMinutes: Math.max(3, batches * 3) };
}
