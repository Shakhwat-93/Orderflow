import { useEffect, useState } from 'react';

const DESKTOP_EXPERIENCE_QUERY = '(min-width: 768px) and (hover: hover) and (pointer: fine)';

const getDesktopExperienceMatch = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(DESKTOP_EXPERIENCE_QUERY).matches;
};

export const useDesktopExperience = () => {
  const [isDesktopExperience, setIsDesktopExperience] = useState(getDesktopExperienceMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(DESKTOP_EXPERIENCE_QUERY);
    const handleChange = (event) => {
      setIsDesktopExperience(event.matches);
    };

    setIsDesktopExperience(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return isDesktopExperience;
};
