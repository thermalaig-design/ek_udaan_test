import { useEffect, useMemo, useState } from 'react';
import { fetchTrustVersion, TRUST_VERSION_UPDATED_EVENT } from '../services/trustVersionService';

const normalizeId = (value) => String(value || '').trim();

export const useTrustDataVersion = (preferredTrustId = '') => {
  const fallbackTrustId = useMemo(
    () => normalizeId(preferredTrustId || import.meta.env.VITE_DEFAULT_TRUST_ID || ''),
    [preferredTrustId]
  );
  const [trustVersion, setTrustVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const resolveTrustId = () =>
      normalizeId(localStorage.getItem('selected_trust_id') || fallbackTrustId);

    const loadVersion = async () => {
      try {
        const trustId = resolveTrustId();
        if (!trustId) {
          if (!cancelled) setTrustVersion(null);
          return;
        }
        const version = await fetchTrustVersion(trustId);
        if (!cancelled) setTrustVersion(version);
      } catch {
        if (!cancelled) setTrustVersion(null);
      }
    };

    const onTrustChanged = () => {
      loadVersion();
    };
    const onFocus = () => {
      loadVersion();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadVersion();
    };
    const onTrustVersionUpdated = (event) => {
      const changedTrustId = normalizeId(event?.detail?.trustId);
      const activeTrustId = resolveTrustId();
      if (!changedTrustId || changedTrustId !== activeTrustId) return;
      setTrustVersion(event?.detail?.nextVersion ?? null);
    };

    loadVersion();
    window.addEventListener('trust-changed', onTrustChanged);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(TRUST_VERSION_UPDATED_EVENT, onTrustVersionUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('trust-changed', onTrustChanged);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(TRUST_VERSION_UPDATED_EVENT, onTrustVersionUpdated);
    };
  }, [fallbackTrustId]);

  return {
    trustVersion,
    displayTrustVersion: trustVersion === null ? 'v-' : `v${trustVersion}`,
  };
};

