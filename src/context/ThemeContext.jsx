import React, { createContext, useContext } from 'react';
import { DEFAULT_THEME } from '../utils/themeUtils';

/**
 * ThemeContext - makes the active trust theme + full theme_config available app-wide.
 *
 * App.jsx sets CSS variables on :root whenever appTheme changes.
 * Components can:
 *   a) Use CSS vars in styles: var(--page-bg), var(--navbar-bg), etc.
 *   b) Read raw values (including themeConfig) with useAppTheme().
 */
export const ThemeContext = createContext(DEFAULT_THEME);

/** Hook - call this inside any page/component to get the live theme object. */
export const useAppTheme = () => useContext(ThemeContext);
