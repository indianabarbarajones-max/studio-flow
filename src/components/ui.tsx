import { useEffect, useRef, type ReactNode } from 'react';
import { X, Leaf } from 'lucide-react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { dialog.close(); document.body.style.overflow = prior; }; }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={onClose} onClick={e => { if (e.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Fechar janela" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function EmptyState({ title, description }: { title: string; description?: string }) { return <div className="empty-state"><Leaf size={30} /><h3>{title}</h3>{description && <p>{description}</p>}</div>; }
