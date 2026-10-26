/** Print a page of HTML through a hidden frame (works in the desktop app, where a new window cannot be opened). */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 120_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
