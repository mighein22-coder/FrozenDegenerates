import React from 'react';
import { Printer } from 'lucide-react';
import { Button } from './Button';

/**
 * Hands the current screen to the browser's print dialog.
 *
 * `window.print()` IS the normal Windows printing interface: it opens the
 * browser's print preview, which offers real printers and Microsoft Print to
 * PDF. A web page cannot skip the preview or call the Windows dialog directly,
 * so there is nothing more native to reach for. What lands on the paper is
 * decided by the `print:` utilities on each screen and the print block in
 * index.css.
 *
 * It hides itself on paper, so no call site has to remember to.
 */
export const PrintButton: React.FC<{ label?: string }> = ({ label = 'Print' }) => (
  <Button
    variant="secondary"
    size="sm"
    className="gap-2 print:hidden"
    onClick={() => window.print()}
  >
    <Printer size={16} aria-hidden />
    {label}
  </Button>
);
