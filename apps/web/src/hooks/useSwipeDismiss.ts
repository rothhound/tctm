import { useRef, useState } from 'react';

export function useSwipeDismiss({ onDismiss, threshold = 120 }: { onDismiss: () => void; threshold?: number }) {
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) setDragY(dy);
  };

  const onTouchEnd = () => {
    if (dragY > threshold) onDismiss();
    else setDragY(0);
    touchStartY.current = null;
  };

  return { dragY, onTouchStart, onTouchMove, onTouchEnd };
}
