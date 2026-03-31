import { useState, useEffect } from 'react';

export function useKeyboard(threshold = 0.85) {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleViewportChange = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      
      const isKeyboardOpen = viewport.height < window.innerHeight * threshold;
      setIsKeyboardVisible(isKeyboardOpen);
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        setIsKeyboardVisible(true);
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA' &&
            !(document.activeElement as HTMLElement)?.isContentEditable) {
          setIsKeyboardVisible(false);
        }
      }, 100);
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('focusin', handleFocus);
    window.addEventListener('focusout', handleBlur);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focusin', handleFocus);
      window.removeEventListener('focusout', handleBlur);
    };
  }, [threshold]);

  return isKeyboardVisible;
}
