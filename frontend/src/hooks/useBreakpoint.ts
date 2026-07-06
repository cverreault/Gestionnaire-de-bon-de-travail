import { useEffect, useState } from 'react';
import { theme } from '../theme';

/**
 * B20 — viewport breakpoint hook.
 *
 *   isMobile   < 768px   (téléphone)
 *   isTablet   768-1023  (tablette / petit laptop)
 *   isDesktop  ≥ 1024    (comportement historique de l'app)
 *
 * Les seuils vivent dans `theme.breakpoints` pour que le CSS global
 * (index.css) et le JS partagent les mêmes valeurs.
 */

export interface Breakpoint {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function compute(): Breakpoint {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true };
  }
  const w = window.innerWidth;
  return {
    isMobile: w < theme.breakpoints.mobile,
    isTablet: w >= theme.breakpoints.mobile && w < theme.breakpoints.tablet,
    isDesktop: w >= theme.breakpoints.tablet,
  };
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(compute);

  useEffect(() => {
    // matchMedia listeners fire only when crossing the boundary — much
    // cheaper than a resize listener firing on every pixel.
    const queries = [
      window.matchMedia(`(max-width: ${theme.breakpoints.mobile - 1}px)`),
      window.matchMedia(`(min-width: ${theme.breakpoints.tablet}px)`),
    ];
    const update = () => setBp(compute());
    for (const q of queries) q.addEventListener('change', update);
    return () => {
      for (const q of queries) q.removeEventListener('change', update);
    };
  }, []);

  return bp;
}
