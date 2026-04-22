const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]';

const toPathSegments = (path) =>
  String(path || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

const readPath = (source, path) => {
  const segments = Array.isArray(path) ? path : toPathSegments(path);
  if (!segments.length) return undefined;
  let current = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
};

const hasTokenValue = (value) => value !== undefined && value !== null && value !== '';

const readConfigToken = (config, path) => {
  const value = readPath(config, path);
  return hasTokenValue(value) ? value : undefined;
};

const deepMerge = (base, override) => {
  if (!isPlainObject(base)) return isPlainObject(override) ? { ...override } : base;
  if (!isPlainObject(override)) return { ...base };
  const next = { ...base };
  Object.keys(override).forEach((key) => {
    const baseValue = base[key];
    const overrideValue = override[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      next[key] = deepMerge(baseValue, overrideValue);
      return;
    }
    next[key] = overrideValue;
  });
  return next;
};

const parseJsonObject = (value, fallback = {}) => {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const sanitizeArrayOfStrings = (value, fallback) => {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
};

export const sanitizeCustomCss = (css) => {
  const text = typeof css === 'string' ? css : '';
  if (!text.trim()) return '';
  const blockedPatterns = [
    /@import/gi,
    /javascript:/gi,
    /expression\s*\(/gi,
    /<\/?script/gi
  ];
  const isBlocked = blockedPatterns.some((pattern) => pattern.test(text));
  return isBlocked ? '' : text;
};

export const DEFAULT_THEME_CONFIG = {
  footer: { bg_color_1: '#1F2937', bg_color_2: null, text_color: '#ffffff', gradient_type: 'none' },
  navbar: { blur: 8, opacity: 0.94, bg_color_1: '#F8FAFC', bg_color_2: null, text_color: '#111827', gradient_type: 'none' },
  marquee: { bg_color_1: '#4B5563', bg_color_2: '#1F2937', text_color: '#ffffff', gradient_type: 'linear', gradient_angle: 90 },
  page_bg: { bg_color_1: '#F8FAFC', bg_color_2: '#EEF2F7', gradient_type: 'linear', gradient_angle: 160 },
  sidebar: {
    blur: 12,
    opacity: 0.97,
    bg_color_1: '#ffffff',
    bg_color_2: null,
    text_color: '#111827',
    button_color: '#4B5563',
    gradient_type: 'none',
    button_text_color: '#ffffff'
  },
  typography: {
    font_family: 'Inter',
    heading_color: '#111827',
    body_text_color: '#374151',
    subheading_color: '#1F2937',
    component_overrides: {
      footer_text: null,
      navbar_text: '#111827',
      marquee_text: '#ffffff',
      sidebar_text: '#111827'
    }
  },
  app_buttons: { bg_color_1: '#4B5563', bg_color_2: null, icon_color: '#ffffff', text_color: '#ffffff', gradient_type: 'none' },
  advertisement: { bg_color: '#EEF2F7', bg_opacity: 1, text_color: '#1F2937' },
  quick_actions: { bg_color_1: '#1F2937', bg_color_2: null, text_color: '#ffffff', gradient_type: 'none', icon_bg_color: '#ffffff' }
};

export const DEFAULT_THEME = {
  primary: '#4B5563',
  secondary: '#1F2937',
  accent: '#EEF2F7',
  accentBg: '#F8FAFC',
  navbarBg: 'rgba(248,250,252,0.94)',
  pageBg: 'linear-gradient(160deg,#F8FAFC 0%,#EEF2F7 100%)',
  sidebarBg: '#ffffff',
  marqueeBg: 'linear-gradient(90deg,#4B5563,#1F2937)',
  homeLayout: ['gallery', 'quickActions', 'sponsors'],
  animations: { cards: 'fadeUp', navbar: 'fadeSlideDown', gallery: 'zoomIn' },
  customCss: '',
  templateKey: 'mahila',
  themeConfig: DEFAULT_THEME_CONFIG,
  template: null,
  trustId: null
};

export const mergeResolvedThemes = (baseTheme, selectedTheme) => {
  const safeBase = baseTheme || DEFAULT_THEME;
  if (!selectedTheme) return { ...safeBase };

  const merged = deepMerge(safeBase, selectedTheme);
  merged.homeLayout = sanitizeArrayOfStrings(
    selectedTheme.homeLayout,
    sanitizeArrayOfStrings(safeBase.homeLayout, DEFAULT_THEME.homeLayout)
  );
  merged.animations = isPlainObject(selectedTheme.animations)
    ? deepMerge(safeBase.animations || DEFAULT_THEME.animations, selectedTheme.animations)
    : (safeBase.animations || DEFAULT_THEME.animations);
  merged.customCss = selectedTheme.customCss || safeBase.customCss || '';
  merged.template = selectedTheme.template || safeBase.template || null;
  merged.templateId = selectedTheme.templateId || safeBase.templateId || null;
  merged.templateUpdatedAt = selectedTheme.templateUpdatedAt || safeBase.templateUpdatedAt || null;
  merged.trustId = selectedTheme.trustId || safeBase.trustId || null;
  return merged;
};

const hexToRgb = (hex) => {
  const value = String(hex || '').trim().replace('#', '');
  if (!/^[\da-fA-F]{3,8}$/.test(value)) return null;
  const normalized = value.length === 3
    ? value.split('').map((part) => part + part).join('')
    : value.slice(0, 6);
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const mixHex = (base, target, ratio) => {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  if (!baseRgb || !targetRgb) return base;
  const t = clamp(Number(ratio) || 0, 0, 1);
  return rgbToHex({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * t,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * t,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * t
  });
};

const shiftHex = (base, amount) => {
  const rgb = hexToRgb(base);
  if (!rgb) return base;
  return rgbToHex({
    r: rgb.r + amount,
    g: rgb.g + amount,
    b: rgb.b + amount
  });
};

const withOpacity = (color, opacity) => {
  if (opacity === null || opacity === undefined) return color;
  const alpha = clamp(Number(opacity), 0, 1);
  if (Number.isNaN(alpha)) return color;
  const rgb = hexToRgb(color);
  if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  return color;
};

export const buildGradient = ({
  bg_color_1,
  bg_color_2,
  gradient_type,
  gradient_angle
} = {}) => {
  const color1 = bg_color_1 || bg_color_2 || '#ffffff';
  const color2 = bg_color_2 || bg_color_1 || color1;
  const type = String(gradient_type || 'none').trim().toLowerCase();
  const angle = Number.isFinite(Number(gradient_angle)) ? Number(gradient_angle) : 135;

  if (type === 'linear') return `linear-gradient(${angle}deg, ${color1}, ${color2})`;
  if (type === 'radial') return `radial-gradient(circle, ${color1}, ${color2})`;
  if (type === 'conic') return `conic-gradient(from ${angle}deg, ${color1}, ${color2})`;
  return color1;
};

const buildSurfaceBackground = (config, fallback) => {
  const gradient = buildGradient(config);
  const type = String(config?.gradient_type || 'none').trim().toLowerCase();
  if (type !== 'none') return gradient || fallback;
  if (config?.bg_color_1 && config?.opacity !== undefined && config?.opacity !== null) {
    return withOpacity(config.bg_color_1, config.opacity);
  }
  return gradient || fallback;
};

export const buildThemeFromTemplate = ({
  templateRow,
  trustOverrides,
  trustId
} = {}) => {
  if (!templateRow) {
    return {
      ...DEFAULT_THEME,
      trustId: trustId || null
    };
  }

  const baseConfig = parseJsonObject(templateRow.theme_config, DEFAULT_THEME_CONFIG);
  const overrideConfig = parseJsonObject(trustOverrides, {});
  const themeConfig = deepMerge(DEFAULT_THEME_CONFIG, deepMerge(baseConfig, overrideConfig));

  const navbar = themeConfig.navbar || {};
  const pageBg = themeConfig.page_bg || {};
  const sidebar = themeConfig.sidebar || {};
  const marquee = themeConfig.marquee || {};
  const quickActions = themeConfig.quick_actions || {};
  const appButtons = themeConfig.app_buttons || {};
  const footer = themeConfig.footer || {};
  const advertisement = themeConfig.advertisement || {};

  const primary = themeConfig.primary_color
    || quickActions.bg_color_1
    || appButtons.bg_color_1
    || marquee.bg_color_1
    || DEFAULT_THEME.primary;
  const secondary = themeConfig.secondary_color
    || navbar.bg_color_1
    || footer.bg_color_1
    || DEFAULT_THEME.secondary;
  const accent = themeConfig.accent_color
    || advertisement.bg_color
    || pageBg.bg_color_2
    || DEFAULT_THEME.accent;
  const accentBg = themeConfig.accent_bg
    || pageBg.bg_color_1
    || DEFAULT_THEME.accentBg;

  const resolvedHomeLayout = sanitizeArrayOfStrings(
    templateRow.home_layout,
    DEFAULT_THEME.homeLayout
  );
  const resolvedAnimations = isPlainObject(templateRow.animations)
    ? templateRow.animations
    : DEFAULT_THEME.animations;

  return {
    primary,
    secondary,
    accent,
    accentBg,
    navbarBg: buildSurfaceBackground(navbar, DEFAULT_THEME.navbarBg),
    pageBg: buildGradient(pageBg),
    sidebarBg: buildSurfaceBackground(sidebar, DEFAULT_THEME.sidebarBg),
    marqueeBg: buildGradient(marquee),
    homeLayout: resolvedHomeLayout,
    animations: resolvedAnimations,
    customCss: sanitizeCustomCss(templateRow.custom_css || ''),
    templateKey: templateRow.template_key || 'mahila',
    themeConfig,
    template: templateRow,
    templateId: templateRow.id || null,
    templateUpdatedAt: templateRow.updated_at || null,
    trustId: trustId || templateRow.trust_id || null
  };
};

export const getThemeToken = (theme, path, fallback, baseTheme = DEFAULT_THEME) => {
  const safeTheme = theme || DEFAULT_THEME;
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return fallback;

  const configPath = normalizedPath.startsWith('theme_config.')
    ? normalizedPath.replace(/^theme_config\./, '')
    : normalizedPath;

  const selectedConfigValue = readConfigToken(safeTheme?.selectedThemeConfigRaw, configPath);
  if (selectedConfigValue !== undefined) return selectedConfigValue;

  const baseConfigValue = readConfigToken(safeTheme?.baseThemeConfigRaw, configPath);
  if (baseConfigValue !== undefined) return baseConfigValue;

  const resolveFromTheme = (targetTheme) => {
    if (!targetTheme) return undefined;
    const configValue = readPath(targetTheme?.themeConfig, configPath);
    if (configValue !== undefined && configValue !== null && configValue !== '') return configValue;

    const topLevelMap = {
      primary_color: targetTheme.primary,
      secondary_color: targetTheme.secondary,
      accent_color: targetTheme.accent,
      accent_bg: targetTheme.accentBg
    };
    if (Object.prototype.hasOwnProperty.call(topLevelMap, configPath)) {
      const mapped = topLevelMap[configPath];
      if (mapped !== undefined && mapped !== null && mapped !== '') return mapped;
    }

    const directValue = readPath(targetTheme, normalizedPath);
    if (directValue !== undefined && directValue !== null && directValue !== '') return directValue;
    return undefined;
  };

  const currentValue = resolveFromTheme(safeTheme);
  if (currentValue !== undefined) return currentValue;

  const baseValue = resolveFromTheme(baseTheme);
  if (baseValue !== undefined) return baseValue;

  return fallback;
};

export const getFooterThemeStyles = (theme, baseTheme = DEFAULT_THEME) => {
  const selectedConfig = theme?.selectedThemeConfigRaw || null;
  const baseConfig = theme?.baseThemeConfigRaw || null;
  const bgColor1 = getThemeToken(
    theme,
    'footer.bg_color_1',
    DEFAULT_THEME_CONFIG.footer.bg_color_1,
    baseTheme
  );
  const bgColor2 = getThemeToken(theme, 'footer.bg_color_2', null, baseTheme);
  const gradientType = getThemeToken(
    theme,
    'footer.gradient_type',
    DEFAULT_THEME_CONFIG.footer.gradient_type,
    baseTheme
  );
  const selectedFooterTextOverride = readConfigToken(selectedConfig, 'typography.component_overrides.footer_text');
  const selectedFooterText = readConfigToken(selectedConfig, 'footer.text_color');
  const baseFooterTextOverride = readConfigToken(baseConfig, 'typography.component_overrides.footer_text');
  const baseFooterText = readConfigToken(baseConfig, 'footer.text_color');

  const fallbackFooterText = getThemeToken(
    theme,
    'footer.text_color',
    DEFAULT_THEME_CONFIG.footer.text_color,
    baseTheme
  );
  const footerTextColor = selectedFooterTextOverride
    || selectedFooterText
    || baseFooterTextOverride
    || baseFooterText
    || fallbackFooterText
    || '#ffffff';
  const footerTextOverride = selectedFooterTextOverride || baseFooterTextOverride || null;

  const footerConfig = {
    bg_color_1: bgColor1,
    bg_color_2: bgColor2,
    text_color: getThemeToken(theme, 'footer.text_color', DEFAULT_THEME_CONFIG.footer.text_color, baseTheme),
    gradient_type: gradientType
  };

  return {
    footerConfig,
    backgroundStyle: buildGradient(footerConfig),
    textColor: footerTextColor,
    usingTypographyOverride: Boolean(footerTextOverride)
  };
};

export const applyThemeCssVariables = (theme, root = document.documentElement) => {
  const safeTheme = theme || DEFAULT_THEME;
  const config = safeTheme.themeConfig || DEFAULT_THEME_CONFIG;
  const navbar = config.navbar || {};
  const pageBg = config.page_bg || {};
  const sidebar = config.sidebar || {};
  const marquee = config.marquee || {};
  const typography = config.typography || {};
  const appButtons = config.app_buttons || {};
  const advertisement = config.advertisement || {};
  const quickActions = config.quick_actions || {};
  const typographyOverrides = typography.component_overrides || {};
  const footerTheme = getFooterThemeStyles(safeTheme, DEFAULT_THEME);

  const primary = safeTheme.primary || DEFAULT_THEME.primary;
  const secondary = safeTheme.secondary || DEFAULT_THEME.secondary;
  const accent = safeTheme.accent || DEFAULT_THEME.accent;
  const accentBg = safeTheme.accentBg || DEFAULT_THEME.accentBg;
  const navbarBg = safeTheme.navbarBg || buildSurfaceBackground(navbar, DEFAULT_THEME.navbarBg);
  const pageBackground = safeTheme.pageBg || buildGradient(pageBg);
  const sidebarBg = safeTheme.sidebarBg || buildSurfaceBackground(sidebar, DEFAULT_THEME.sidebarBg);
  const marqueeBg = safeTheme.marqueeBg || buildGradient(marquee);

  root.style.setProperty('--brand-red', primary);
  root.style.setProperty('--brand-red-dark', shiftHex(primary, -36));
  root.style.setProperty('--brand-red-mid', shiftHex(primary, 22));
  root.style.setProperty('--brand-red-light', mixHex(primary, '#ffffff', 0.86));
  root.style.setProperty('--brand-navy', secondary);
  root.style.setProperty('--brand-navy-dark', shiftHex(secondary, -32));
  root.style.setProperty('--brand-navy-light', mixHex(secondary, '#ffffff', 0.88));
  root.style.setProperty('--app-accent', accent);
  root.style.setProperty('--app-accent-bg', accentBg);
  root.style.setProperty('--app-navbar-bg', navbarBg);
  root.style.setProperty('--app-page-bg', pageBackground);

  root.style.setProperty('--page-bg', pageBackground);
  root.style.setProperty('--navbar-bg', navbarBg);
  root.style.setProperty('--navbar-text', typographyOverrides.navbar_text || navbar.text_color || typography.body_text_color || '#111827');
  root.style.setProperty('--navbar-blur', `${Number(navbar.blur) || 8}px`);
  root.style.setProperty('--navbar-opacity', `${clamp(Number(navbar.opacity ?? 1), 0, 1)}`);
  root.style.setProperty('--navbar-accent', `linear-gradient(90deg, ${secondary}, ${primary}, ${secondary})`);
  root.style.setProperty('--navbar-border', withOpacity(primary, 0.12));

  root.style.setProperty('--sidebar-bg', sidebarBg);
  root.style.setProperty('--sidebar-text', typographyOverrides.sidebar_text || sidebar.text_color || '#111827');
  root.style.setProperty('--sidebar-blur', `${Number(sidebar.blur) || 12}px`);
  root.style.setProperty('--sidebar-opacity', `${clamp(Number(sidebar.opacity ?? 1), 0, 1)}`);
  root.style.setProperty('--sidebar-button-bg', sidebar.button_color || primary);
  root.style.setProperty('--sidebar-button-text', sidebar.button_text_color || '#ffffff');
  root.style.setProperty('--sidebar-border', withOpacity(primary, 0.1));
  root.style.setProperty('--sidebar-accent', `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})`);

  root.style.setProperty('--marquee-bg', marqueeBg);
  root.style.setProperty('--marquee-text', typographyOverrides.marquee_text || marquee.text_color || '#ffffff');

  root.style.setProperty('--footer-bg', footerTheme.backgroundStyle);
  root.style.setProperty('--footer-text', footerTheme.textColor);
  root.style.setProperty('--footer-border', withOpacity(footerTheme.textColor, 0.24));
  root.style.setProperty('--footer-accent', withOpacity(footerTheme.textColor, 0.45));
  root.style.setProperty('--quick-actions-bg', buildGradient(quickActions));
  root.style.setProperty('--quick-actions-text', quickActions.text_color || '#ffffff');
  root.style.setProperty('--quick-actions-icon-bg', quickActions.icon_bg_color || '#ffffff');
  root.style.setProperty('--app-button-bg', buildGradient(appButtons));
  root.style.setProperty('--app-button-text', appButtons.text_color || '#ffffff');
  root.style.setProperty('--app-button-icon', appButtons.icon_color || '#ffffff');
  root.style.setProperty('--advertisement-bg', withOpacity(advertisement.bg_color || accent, advertisement.bg_opacity ?? 1));
  root.style.setProperty('--advertisement-text', advertisement.text_color || secondary);

  root.style.setProperty('--font-family', typography.font_family || DEFAULT_THEME_CONFIG.typography.font_family);
  root.style.setProperty('--heading-color', typography.heading_color || '#111827');
  root.style.setProperty('--subheading-color', typography.subheading_color || secondary);
  root.style.setProperty('--body-text-color', typography.body_text_color || '#374151');
};
