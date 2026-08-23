/* ─── ตั้ง caret ใน input โดยไม่ให้หน้าจอเลื่อน ─────────────────────────
   บางเบราว์เซอร์ (โดยเฉพาะ iOS Safari / LINE webview) เมื่อเรียก
   setSelectionRange บน input ที่ focus อยู่ จะ "เลื่อน scrollable ancestor /
   หน้าเพจ" เพื่อดึง caret เข้ามาในจอ → หน้าจอกระตุก/ขยับ + caret ดูไม่ตรง
   helper นี้เก็บตำแหน่ง scroll ของ ancestor ทุกชั้น + หน้าเพจ ก่อนตั้ง caret
   แล้วคืนทันที → caret ถูกต้องโดยจอไม่เลื่อน                                   */
export function setCaretKeepScroll(el: HTMLInputElement, pos: number): void {
  const scrolls: { node: Element; top: number; left: number }[] = [];
  let node: Element | null = el.parentElement;
  while (node) {
    if (
      node.scrollHeight > node.clientHeight ||
      node.scrollWidth > node.clientWidth
    ) {
      scrolls.push({ node, top: node.scrollTop, left: node.scrollLeft });
    }
    node = node.parentElement;
  }
  const wx = window.scrollX;
  const wy = window.scrollY;

  el.setSelectionRange(pos, pos);

  // คืน scroll ที่อาจถูกเลื่อนจาก setSelectionRange
  for (const s of scrolls) {
    if (s.node.scrollTop !== s.top) s.node.scrollTop = s.top;
    if (s.node.scrollLeft !== s.left) s.node.scrollLeft = s.left;
  }
  if (window.scrollX !== wx || window.scrollY !== wy) window.scrollTo(wx, wy);
}
