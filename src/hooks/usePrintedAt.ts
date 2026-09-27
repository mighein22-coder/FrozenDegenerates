import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * The moment the page was last sent to the printer.
 *
 * A time taken at render would be whenever the screen last happened to
 * re-render — on a locked week that can be hours before the print. This one is
 * set on `beforeprint`, and `flushSync` commits it before the browser lays out
 * the page for paper; an ordinary state update would land after.
 */
export function usePrintedAt(): Date {
  const [printedAt, setPrintedAt] = useState(() => new Date());

  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAt(new Date()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  return printedAt;
}
