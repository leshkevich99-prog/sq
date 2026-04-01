import { useState, useEffect } from 'react';

export function useKeyboard(threshold = 0.85) {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Initial height to compare against
    const initialHeight = window.innerHeight;

    const handleViewportChange = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      
      // On some mobile browsers (especially iOS TWA), innerHeight might change with viewport
      // so we check both the ratio to window.innerHeight and the ratio to the initial height
      const isKeyboardOpen = 
        viewport.height < window.innerHeight * threshold || 
        viewport.height < initialHeight * threshold;
        
      setIsKeyboardVisible(isKeyboardOpen);
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Immediate feedback on focus
        setIsKeyboardVisible(true);
      }
    };

    const handleBlur = () => {
      // Small delay to see if focus moved to another input
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || (
            active.tagName !== 'INPUT' && 
            active.tagName !== 'TEXTAREA' &&
            !(active as HTMLElement)?.isContentEditable
        )) {
          // If no input is active, check the viewport again
          const viewport = window.visualViewport;
          if (viewport) {
            const isActuallyOpen = viewport.height < window.innerHeight * threshold;
            setIsKeyboardVisible(isActuallyOpen);
          } else {
            setIsKeyboardVisible(false);
          }
        }
      }, 150);
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('focusin', handleFocus);
    window.addEventListener('focusout', handleBlur);

    // Also listen to orientation change as it resets the "initial" state
    const handleOrientationChange = () => {
      setTimeout(handleViewportChange, 300);
    };
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focusin', handleFocus);
      window.removeEventListener('focusout', handleBlur);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [threshold]);

  return isKeyboardVisible;
}
