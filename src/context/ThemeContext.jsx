import { createContext, useContext, useEffect, useState } from 'react';
import { getLocalStorage } from '../platform/storage';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const storage = getLocalStorage();
  const [theme, setTheme] = useState(() => {
    return storage.getItem('theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    storage.setItem('theme', theme);
  }, [storage, theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
