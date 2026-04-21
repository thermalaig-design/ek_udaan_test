import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchGalleryFoldersPaginated, fetchPhotosByFolderPaginated } from '../services/galleryService';

const GALLERY_CONTEXT_VERSION = 4;
const GALLERY_CACHE_KEY = 'gallery_normalized_cache_v4';
const ALBUMS_META_TTL_MS = 20 * 60 * 1000; // 20 mins
const ALBUM_DETAIL_TTL_MS = 12 * 60 * 1000; // 12 mins
const PAGE_TTL_MS = 12 * 60 * 1000; // 12 mins
const IMAGES_PER_PAGE = 10;
const ALBUMS_BATCH_SIZE = 12;

const GalleryContext = createContext();

const getSelectedTrustId = () => {
  try {
    return localStorage.getItem('selected_trust_id') || null;
  } catch {
    return null;
  }
};

const isFresh = (timestamp, ttlMs) => {
  if (!timestamp || !Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < ttlMs;
};

const dedupeImagesById = (images = []) => {
  const seen = new Set();
  const result = [];
  for (const image of images) {
    const id = String(image?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(image);
  }
  return result;
};

const createEmptyStore = (trustId = null) => ({
  trustId,
  albumsById: {},
  albumOrder: [],
  albumListPages: {},
  hasMoreAlbums: true,
  nextAlbumPage: 1,
  albumDetails: {},
  cacheTimestamps: {
    albumsMeta: null,
    albumListPages: {},
    albumDetails: {},
    pages: {},
  },
  lastFetchTime: null,
});

const readPersistedStore = () => {
  const trustId = getSelectedTrustId();
  const empty = createEmptyStore(trustId);
  try {
    const raw = localStorage.getItem(GALLERY_CACHE_KEY);
    if (!raw) return empty;

    const parsed = JSON.parse(raw);
    if (
      parsed?.version !== GALLERY_CONTEXT_VERSION ||
      parsed?.trustId !== trustId ||
      !parsed?.data
    ) {
      return empty;
    }

    const data = parsed.data;
    return {
      trustId,
      albumsById: data.albumsById || {},
      albumOrder: Array.isArray(data.albumOrder) ? data.albumOrder : [],
      albumListPages: data.albumListPages || {},
      hasMoreAlbums: typeof data.hasMoreAlbums === 'boolean' ? data.hasMoreAlbums : true,
      nextAlbumPage: Number(data.nextAlbumPage || 1),
      albumDetails: data.albumDetails || {},
      cacheTimestamps: data.cacheTimestamps || {
        albumsMeta: null,
        albumListPages: {},
        albumDetails: {},
        pages: {},
      },
      lastFetchTime: data.lastFetchTime || data.cacheTimestamps?.albumsMeta || null,
    };
  } catch {
    return empty;
  }
};

export function GalleryProvider({ children }) {
  const bootstrap = readPersistedStore();

  const [trustId, setTrustId] = useState(bootstrap.trustId);
  const [albumsById, setAlbumsById] = useState(bootstrap.albumsById);
  const [albumOrder, setAlbumOrder] = useState(bootstrap.albumOrder);
  const [albumListPages, setAlbumListPages] = useState(bootstrap.albumListPages);
  const [hasMoreAlbums, setHasMoreAlbums] = useState(bootstrap.hasMoreAlbums);
  const [nextAlbumPage, setNextAlbumPage] = useState(bootstrap.nextAlbumPage);
  const [albumDetails, setAlbumDetails] = useState(bootstrap.albumDetails);
  const [cacheTimestamps, setCacheTimestamps] = useState(bootstrap.cacheTimestamps);
  const [lastFetchTime, setLastFetchTime] = useState(bootstrap.lastFetchTime);
  const [isLoading, setIsLoading] = useState(bootstrap.albumOrder.length === 0);
  const [isLoadingMoreAlbums, setIsLoadingMoreAlbums] = useState(false);
  const [error, setError] = useState(null);

  const albumsPageInFlightRef = useRef(new Map());
  const pageInFlightRef = useRef(new Map());

  const ensureTrustSynced = useCallback(() => {
    const selectedTrustId = getSelectedTrustId();
    if (selectedTrustId === trustId) return selectedTrustId;

    setTrustId(selectedTrustId);
    setAlbumsById({});
    setAlbumOrder([]);
    setAlbumListPages({});
    setHasMoreAlbums(true);
    setNextAlbumPage(1);
    setAlbumDetails({});
    setCacheTimestamps({
      albumsMeta: null,
      albumListPages: {},
      albumDetails: {},
      pages: {},
    });
    setLastFetchTime(null);
    setError(null);
    albumsPageInFlightRef.current.clear();
    pageInFlightRef.current.clear();
    return selectedTrustId;
  }, [trustId]);

  const persistStore = useCallback((nextStore) => {
    try {
      localStorage.setItem(
        GALLERY_CACHE_KEY,
        JSON.stringify({
          version: GALLERY_CONTEXT_VERSION,
          trustId: nextStore.trustId,
          timestamp: Date.now(),
          data: nextStore,
        })
      );
    } catch {
      // ignore persistence failures
    }
  }, []);

  const fetchAlbumsMetaPage = useCallback(async (activeTrustId, page) => {
    const { folders, hasMore } = await fetchGalleryFoldersPaginated(activeTrustId, page, ALBUMS_BATCH_SIZE);
    const previewResults = await Promise.allSettled(
      folders.map(async (folder) => {
        const res = await fetchPhotosByFolderPaginated(
          folder.id,
          activeTrustId,
          1,
          2,
          { includeCount: true, countMode: 'planned' }
        );
        return {
          folderId: String(folder.id),
          photos: res?.photos || [],
          totalCount: res?.totalCount || 0,
        };
      })
    );

    const previewsByFolder = {};
    previewResults.forEach((result, idx) => {
      const folder = folders[idx];
      if (!folder) return;
      const folderId = String(folder.id);
      if (result.status === 'fulfilled') {
        previewsByFolder[folderId] = result.value;
      } else {
        previewsByFolder[folderId] = { photos: [], totalCount: 0 };
      }
    });

    return { folders, hasMore, previewsByFolder };
  }, []);

  const loadAlbumsPage = useCallback(async (page, opts = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const activeTrustId = ensureTrustSynced();
    if (!activeTrustId) {
      setIsLoading(false);
      setIsLoadingMoreAlbums(false);
      return { fromCache: true, page: safePage };
    }

    const force = opts?.force === true;
    const replaceFirstPage = opts?.replaceFirstPage === true;
    const cachedPageIds = albumListPages?.[safePage];
    const pageTs = cacheTimestamps.albumListPages?.[safePage];
    const pageIsFresh = Array.isArray(cachedPageIds)
      && cachedPageIds.length > 0
      && isFresh(pageTs, ALBUMS_META_TTL_MS);

    if (!force && pageIsFresh) {
      return { fromCache: true, page: safePage };
    }

    if (!force && Array.isArray(cachedPageIds) && cachedPageIds.length > 0 && opts?.background === true) {
      void loadAlbumsPage(safePage, { force: true, replaceFirstPage });
      return { fromCache: true, page: safePage, stale: true };
    }

    const requestKey = `${activeTrustId || 'global'}:${safePage}`;
    if (albumsPageInFlightRef.current.has(requestKey) && !force) {
      return albumsPageInFlightRef.current.get(requestKey);
    }

    const run = (async () => {
      const shouldShowInitialLoader = safePage === 1 && albumOrder.length === 0;
      if (shouldShowInitialLoader) setIsLoading(true);
      if (!shouldShowInitialLoader) setIsLoadingMoreAlbums(true);
      setError(null);
      try {
        const { folders, hasMore, previewsByFolder } = await fetchAlbumsMetaPage(activeTrustId, safePage);
        const pageAlbumIds = [];
        const nextAlbumsById = { ...albumsById };

        folders.forEach((folder) => {
          const id = String(folder.id);
          pageAlbumIds.push(id);
          const preview = dedupeImagesById(previewsByFolder[id]?.photos || []).slice(0, 2);
          const count = Number(previewsByFolder[id]?.totalCount || 0);
          nextAlbumsById[id] = {
            id,
            name: folder.name || 'General',
            description: folder.description || '',
            imageCount: count,
            previewImages: preview,
          };
        });

        const nextAlbumOrder = (() => {
          const existing = [...albumOrder];
          if (safePage === 1 && replaceFirstPage) {
            const remaining = existing.filter((id) => !pageAlbumIds.includes(id));
            return [...pageAlbumIds, ...remaining];
          }
          const seen = new Set(existing);
          pageAlbumIds.forEach((id) => {
            if (seen.has(id)) return;
            seen.add(id);
            existing.push(id);
          });
          return existing;
        })();

        const nextAlbumListPages = {
          ...albumListPages,
          [safePage]: pageAlbumIds,
        };

        const now = Date.now();
        const nextTimestamps = {
          albumsMeta: now,
          albumListPages: {
            ...(cacheTimestamps.albumListPages || {}),
            [safePage]: now,
          },
          albumDetails: { ...cacheTimestamps.albumDetails },
          pages: { ...cacheTimestamps.pages },
        };
        const nextPage = hasMore ? (safePage + 1) : safePage;

        const nextStore = {
          trustId: activeTrustId,
          albumsById: nextAlbumsById,
          albumOrder: nextAlbumOrder,
          albumListPages: nextAlbumListPages,
          hasMoreAlbums: hasMore,
          nextAlbumPage: nextPage,
          albumDetails,
          cacheTimestamps: nextTimestamps,
          lastFetchTime: now,
        };

        setAlbumsById(nextAlbumsById);
        setAlbumOrder(nextAlbumOrder);
        setAlbumListPages(nextAlbumListPages);
        setHasMoreAlbums(hasMore);
        setNextAlbumPage(nextPage);
        setCacheTimestamps(nextTimestamps);
        setLastFetchTime(now);
        setError(null);
        persistStore(nextStore);
        return { fromCache: false, page: safePage, hasMore };
      } catch (err) {
        setError(err?.message || 'Failed to load gallery');
        return { fromCache: Boolean(cachedPageIds?.length), page: safePage };
      } finally {
        setIsLoading(false);
        setIsLoadingMoreAlbums(false);
      }
    })().finally(() => {
      albumsPageInFlightRef.current.delete(requestKey);
    });

    albumsPageInFlightRef.current.set(requestKey, run);
    return run;
  }, [
    albumDetails,
    albumListPages,
    albumOrder,
    albumsById,
    cacheTimestamps.albumDetails,
    cacheTimestamps.albumListPages,
    cacheTimestamps.pages,
    ensureTrustSynced,
    fetchAlbumsMetaPage,
    persistStore,
  ]);

  const ensureAlbumsLoaded = useCallback(async (opts = {}) => {
    const force = opts?.force === true;
    const hasFirstPage = Array.isArray(albumListPages?.[1]) && albumListPages[1].length > 0;
    const firstPageTs = cacheTimestamps.albumListPages?.[1];
    const firstPageFresh = hasFirstPage && isFresh(firstPageTs, ALBUMS_META_TTL_MS);

    if (!force && hasFirstPage && firstPageFresh) {
      return { fromCache: true, page: 1 };
    }
    if (!force && hasFirstPage && !firstPageFresh && opts?.background === true) {
      void loadAlbumsPage(1, { force: true, replaceFirstPage: true });
      return { fromCache: true, page: 1, stale: true };
    }
    return loadAlbumsPage(1, { force, replaceFirstPage: force && hasFirstPage });
  }, [albumListPages, cacheTimestamps.albumListPages, loadAlbumsPage]);

  const loadMoreAlbums = useCallback(async () => {
    if (!hasMoreAlbums) return { done: true, fromCache: true };
    const targetPage = Math.max(1, Number(nextAlbumPage || 1));
    return loadAlbumsPage(targetPage);
  }, [hasMoreAlbums, loadAlbumsPage, nextAlbumPage]);

  const isAlbumPageCached = useCallback((albumId, page = 1) => {
    const aid = String(albumId || '');
    if (!aid) return false;
    const pageTs = cacheTimestamps.pages?.[aid]?.[page];
    return Boolean(pageTs && isFresh(pageTs, PAGE_TTL_MS) && albumDetails?.[aid]?.pages?.[page]);
  }, [albumDetails, cacheTimestamps.pages]);

  const getAlbumPage = useCallback(async (albumId, page = 1, opts = {}) => {
    const aid = String(albumId || '');
    if (!aid) {
      return { photos: [], totalPages: 0, totalCount: 0, perPage: IMAGES_PER_PAGE, fromCache: true };
    }

    const activeTrustId = ensureTrustSynced();
    const cachedPage = albumDetails?.[aid]?.pages?.[page] || null;
    const pageTs = cacheTimestamps.pages?.[aid]?.[page];
    const pageIsFresh = Boolean(cachedPage && pageTs && isFresh(pageTs, PAGE_TTL_MS));

    if (!opts?.force && pageIsFresh) {
      return {
        photos: cachedPage,
        totalPages: albumDetails?.[aid]?.totalPages || 0,
        totalCount: albumDetails?.[aid]?.totalCount || albumsById?.[aid]?.imageCount || 0,
        perPage: IMAGES_PER_PAGE,
        fromCache: true,
      };
    }

    if (!opts?.force && cachedPage && opts?.background === true) {
      void getAlbumPage(aid, page, { force: true });
      return {
        photos: cachedPage,
        totalPages: albumDetails?.[aid]?.totalPages || 0,
        totalCount: albumDetails?.[aid]?.totalCount || albumsById?.[aid]?.imageCount || 0,
        perPage: IMAGES_PER_PAGE,
        fromCache: true,
        stale: true,
      };
    }

    const requestKey = `${activeTrustId || 'global'}:${aid}:${page}`;
    if (pageInFlightRef.current.has(requestKey)) {
      return pageInFlightRef.current.get(requestKey);
    }

    const run = (async () => {
      const res = await fetchPhotosByFolderPaginated(aid, activeTrustId, page, IMAGES_PER_PAGE);
      const previewImages = albumsById?.[aid]?.previewImages || [];
      const pagePhotos = page === 1
        ? dedupeImagesById([...previewImages, ...(res?.photos || [])])
        : (res?.photos || []);

      const current = albumDetails?.[aid] || { pages: {}, loadedPages: [] };
      const loadedPages = Array.from(new Set([...(current.loadedPages || []), page])).sort((a, b) => a - b);
      const now = Date.now();

      const nextAlbumDetails = {
        ...albumDetails,
        [aid]: {
          pages: {
            ...(current.pages || {}),
            [page]: pagePhotos,
          },
          loadedPages,
          totalPages: Number(res?.totalPages || current.totalPages || 0),
          totalCount: Number(res?.totalCount || current.totalCount || 0),
          perPage: IMAGES_PER_PAGE,
          lastFetchedAt: now,
        },
      };

      const nextAlbumsById = {
        ...albumsById,
        [aid]: {
          ...(albumsById?.[aid] || { id: aid, name: 'Album', previewImages: [] }),
          imageCount: Number(res?.totalCount || albumsById?.[aid]?.imageCount || 0),
          previewImages: (albumsById?.[aid]?.previewImages || []).slice(0, 2),
        },
      };

      const nextTimestamps = {
        albumsMeta: cacheTimestamps.albumsMeta,
        albumListPages: { ...(cacheTimestamps.albumListPages || {}) },
        albumDetails: {
          ...(cacheTimestamps.albumDetails || {}),
          [aid]: now,
        },
        pages: {
          ...(cacheTimestamps.pages || {}),
          [aid]: {
            ...(cacheTimestamps.pages?.[aid] || {}),
            [page]: now,
          },
        },
      };

      const nextStore = {
        trustId: activeTrustId,
        albumsById: nextAlbumsById,
        albumOrder,
        albumListPages,
        hasMoreAlbums,
        nextAlbumPage,
        albumDetails: nextAlbumDetails,
        cacheTimestamps: nextTimestamps,
        lastFetchTime: lastFetchTime || cacheTimestamps.albumsMeta || now,
      };

      setAlbumsById(nextAlbumsById);
      setAlbumDetails(nextAlbumDetails);
      setCacheTimestamps(nextTimestamps);
      persistStore(nextStore);

      return {
        photos: pagePhotos,
        totalPages: Number(res?.totalPages || 0),
        totalCount: Number(res?.totalCount || 0),
        perPage: IMAGES_PER_PAGE,
        fromCache: false,
      };
    })()
      .finally(() => {
        pageInFlightRef.current.delete(requestKey);
      });

    pageInFlightRef.current.set(requestKey, run);
    return run;
  }, [
    albumDetails,
    albumListPages,
    albumOrder,
    albumsById,
    cacheTimestamps.albumDetails,
    cacheTimestamps.albumListPages,
    cacheTimestamps.albumsMeta,
    cacheTimestamps.pages,
    ensureTrustSynced,
    hasMoreAlbums,
    lastFetchTime,
    nextAlbumPage,
    persistStore,
  ]);

  const invalidateCache = useCallback(() => {
    try {
      localStorage.removeItem(GALLERY_CACHE_KEY);
    } catch {
      // ignore
    }
    const activeTrustId = getSelectedTrustId();
    setTrustId(activeTrustId);
    setAlbumsById({});
    setAlbumOrder([]);
    setAlbumListPages({});
    setHasMoreAlbums(true);
    setNextAlbumPage(1);
    setAlbumDetails({});
    setCacheTimestamps({
      albumsMeta: null,
      albumListPages: {},
      albumDetails: {},
      pages: {},
    });
    setLastFetchTime(null);
    setError(null);
    setIsLoading(false);
    setIsLoadingMoreAlbums(false);
    albumsPageInFlightRef.current.clear();
    pageInFlightRef.current.clear();
  }, []);

  const refreshGallery = useCallback(async () => {
    await ensureAlbumsLoaded({ force: true });
  }, [ensureAlbumsLoaded]);

  useEffect(() => {
    void ensureAlbumsLoaded({ background: true });
  }, [ensureAlbumsLoaded]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'selected_trust_id') {
        ensureTrustSynced();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [ensureTrustSynced]);

  const folders = useMemo(
    () => albumOrder
      .map((id) => albumsById[id])
      .filter(Boolean)
      .map((album) => ({
        id: album.id,
        name: album.name,
        description: album.description || '',
      })),
    [albumOrder, albumsById]
  );

  const images = useMemo(
    () => {
      const previews = albumOrder.flatMap((id) => albumsById[id]?.previewImages || []);
      return dedupeImagesById(previews);
    },
    [albumOrder, albumsById]
  );

  const carouselImages = useMemo(() => {
    const list = albumOrder.flatMap((id) => {
      const album = albumsById[id];
      if (!album) return [];
      const previews = (album.previewImages || []).map((img) => ({
        ...img,
        folderId: album.id,
        folderName: album.name,
      }));
      return previews;
    });
    return dedupeImagesById(list).slice(0, 6);
  }, [albumOrder, albumsById]);

  const cacheTimeRemaining = cacheTimestamps.albumsMeta
    ? Math.max(0, ALBUMS_META_TTL_MS - (Date.now() - cacheTimestamps.albumsMeta))
    : null;

  const value = {
    trustId,
    isLoading,
    isLoadingMoreAlbums,
    hasMoreAlbums,
    nextAlbumPage,
    albumBatchSize: ALBUMS_BATCH_SIZE,
    error,
    lastFetchTime,
    cacheTimeRemaining,
    albumsById,
    albumOrder,
    albumListPages,
    albumDetails,
    cacheTimestamps,
    folders,
    images,
    carouselImages,
    ensureAlbumsLoaded,
    loadMoreAlbums,
    getAlbumPage,
    isAlbumPageCached,
    refreshGallery,
    invalidateCache,
    ttlConfig: {
      albumsMetaMs: ALBUMS_META_TTL_MS,
      albumDetailMs: ALBUM_DETAIL_TTL_MS,
      pageMs: PAGE_TTL_MS,
      pageSize: IMAGES_PER_PAGE,
      albumBatchSize: ALBUMS_BATCH_SIZE,
    },
  };

  return (
    <GalleryContext.Provider value={value}>
      {children}
    </GalleryContext.Provider>
  );
}

export function useGalleryContext() {
  const context = useContext(GalleryContext);
  if (!context) {
    throw new Error('useGalleryContext must be used within GalleryProvider');
  }
  return context;
}
