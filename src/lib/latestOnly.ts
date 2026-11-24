/** Call at the start of each async load; the returned fn tells whether that load is still the latest one. */
export function createLatestOnly(): () => () => boolean {
  let seq = 0
  return () => {
    const mine = ++seq
    return () => mine === seq
  }
}
