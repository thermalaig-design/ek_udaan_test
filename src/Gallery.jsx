import { useAppTheme } from './context/ThemeContext';
import { useGalleryContext } from './context/GalleryContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Image as ImageIcon, X, ChevronLeft, ChevronRight,
  Menu, Home as HomeIcon, FolderOpen, Play, Pause, ArrowLeft
} from 'lucide-react';
import Sidebar from './components/Sidebar';

function FolderCover({ photos, folderName }) {
  const [p1Err, setP1Err] = useState(false);
  const [p2Err, setP2Err] = useState(false);
  const photo1 = photos[0]?.url || null;
  const photo2 = photos[1]?.url || null;

  if (!photo1 || p1Err) {
    return (
      <div style={cs.coverFallback}>
        <FolderOpen style={{ width: 32, height: 32, color: 'var(--body-text-color)' }} />
      </div>
    );
  }

  if (!photo2 || p2Err) {
    return (
      <div style={cs.coverSingle}>
        <img
          src={photo1}
          alt={folderName}
          style={cs.coverImgSingle}
          onError={() => setP1Err(true)}
          loading="lazy"
        />
        <div style={cs.vignette} />
      </div>
    );
  }

  return (
    <div style={cs.coverCollage}>
      <div style={cs.collagePanelLeft}>
        <img
          src={photo1}
          alt={folderName}
          style={cs.collageImg}
          onError={() => setP1Err(true)}
          loading="lazy"
        />
      </div>
      <div style={cs.collagePanelRight}>
        <img
          src={photo2}
          alt={folderName}
          style={cs.collageImg}
          onError={() => setP2Err(true)}
          loading="lazy"
        />
      </div>
      <div style={cs.collageDivider} />
      <div style={cs.vignette} />
    </div>
  );
}

const cs = {
  coverFallback: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--app-accent-bg), color-mix(in srgb, var(--brand-navy-light) 80%, var(--surface-color)))',
  },
  coverSingle: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  coverImgSingle: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  coverCollage: { width: '100%', height: '100%', position: 'relative', display: 'flex', overflow: 'hidden' },
  collagePanelLeft: {
    width: '60%', height: '100%', overflow: 'hidden', flexShrink: 0,
  },
  collagePanelRight: {
    width: '40%', height: '100%', overflow: 'hidden', flexShrink: 0,
    transform: 'scale(1.04)', transformOrigin: 'center',
  },
  collageImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  collageDivider: {
    position: 'absolute', top: 0, left: '58%',
    width: '3px', height: '100%',
    background: 'color-mix(in srgb, var(--surface-color) 55%, transparent)',
    transform: 'skewX(-2deg)',
    zIndex: 2,
    boxShadow: '0 0 6px color-mix(in srgb, var(--brand-navy-dark) 25%, transparent)',
  },
  vignette: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, transparent 40%, color-mix(in srgb, var(--brand-navy-dark) 38%, transparent) 100%)',
    pointerEvents: 'none',
    zIndex: 3,
  },
};

export function Gallery({ onNavigate }) {
  const navigate = useNavigate();
  const theme = useAppTheme();
  const {
    trustId,
    albumsById,
    albumOrder,
    albumDetails,
    isLoading,
    isLoadingMoreAlbums,
    hasMoreAlbums,
    error,
    ensureAlbumsLoaded,
    loadMoreAlbums,
    getAlbumPage,
    isAlbumPageCached,
  } = useGalleryContext();

  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [albumPageImages, setAlbumPageImages] = useState([]);
  const [albumTotalPages, setAlbumTotalPages] = useState(0);
  const listBottomRef = useRef(null);
  const fetchDebounceRef = useRef(null);
  const IMAGES_PER_PAGE = 10;
  const SLIDER_INTERVAL_MS = 2500;

  const albums = useMemo(
    () => albumOrder.map((id) => albumsById[id]).filter(Boolean),
    [albumOrder, albumsById]
  );

  const selectedAlbum = selectedAlbumId ? albumsById[String(selectedAlbumId)] : null;

  useEffect(() => {
    void ensureAlbumsLoaded({ background: true });
  }, [ensureAlbumsLoaded]);

  useEffect(() => {
    if (selectedAlbumId) return undefined;
    if (!hasMoreAlbums) return undefined;

    const node = listBottomRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        if (isLoading || isLoadingMoreAlbums || !hasMoreAlbums) return;
        if (fetchDebounceRef.current) return;

        fetchDebounceRef.current = setTimeout(() => {
          void loadMoreAlbums();
          fetchDebounceRef.current = null;
        }, 180);
      },
      {
        root: null,
        rootMargin: '240px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = null;
      }
    };
  }, [hasMoreAlbums, isLoading, isLoadingMoreAlbums, loadMoreAlbums, selectedAlbumId]);

  useEffect(() => {
    if (isMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = parseInt(document.body.style.top || '0', 10) * -1;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [isMenuOpen]);

  const totalPages = Math.max(0, Number(albumTotalPages || 0));
  const filteredImages = albumPageImages;

  useEffect(() => {
    setSelectedAlbumId(null);
    setCurrentPage(1);
    setAlbumPageImages([]);
    setAlbumTotalPages(0);
    setSelectedImage(null);
    setIsPlaying(false);
    if (import.meta.env.DEV || import.meta.env.VITE_GALLERY_DEBUG === 'true') {
      // eslint-disable-next-line no-console
      console.log('[Gallery][Trust] UI state reset on trust change', {
        selectedTrustId: trustId || null,
      });
    }
  }, [trustId]);

  const loadAlbumPage = useCallback(async (albumId, page, opts = {}) => {
    const aid = String(albumId || '');
    if (!aid) return;

    const previewImages = (albumsById[aid]?.previewImages || []).slice(0, 2);
    const details = albumDetails?.[aid];
    const cachedPage = details?.pages?.[page] || null;

    if (page === 1 && previewImages.length > 0 && (!cachedPage || cachedPage.length === 0)) {
      setAlbumPageImages(previewImages);
    }
    if (cachedPage && cachedPage.length > 0) {
      setAlbumPageImages(cachedPage);
      if (details?.totalPages) setAlbumTotalPages(details.totalPages);
    }

    const shouldShowSpinner = !isAlbumPageCached(aid, page) && !opts?.silent;
    if (shouldShowSpinner) setIsAlbumLoading(true);

    try {
      const res = await getAlbumPage(aid, page);
      setAlbumPageImages(res.photos || []);
      setAlbumTotalPages(Number(res.totalPages || 0));
    } catch (err) {
      console.error('Error loading album page:', err);
      if (!cachedPage && previewImages.length === 0) {
        setAlbumPageImages([]);
        setAlbumTotalPages(0);
      }
    } finally {
      if (shouldShowSpinner) setIsAlbumLoading(false);
    }
  }, [albumDetails, albumsById, getAlbumPage, isAlbumPageCached]);

  const handleAlbumClick = async (albumId) => {
    const aid = String(albumId);
    setSelectedAlbumId(aid);
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await loadAlbumPage(aid, 1, { silent: true });
  };

  useEffect(() => {
    if (!selectedAlbumId || currentPage === 1) return;
    void loadAlbumPage(selectedAlbumId, currentPage);
  }, [currentPage, selectedAlbumId, loadAlbumPage]);

  const openLightbox = (image) => { setSelectedImage(image); setIsPlaying(true); };
  const closeLightbox = () => { setSelectedImage(null); setIsPlaying(false); };
  const goToPrevious = () => {
    const idx = filteredImages.findIndex((img) => img.id === selectedImage.id);
    setSelectedImage(filteredImages[idx === 0 ? filteredImages.length - 1 : idx - 1]);
  };
  const goToNext = () => {
    const idx = filteredImages.findIndex((img) => img.id === selectedImage.id);
    setSelectedImage(filteredImages[idx === filteredImages.length - 1 ? 0 : idx + 1]);
  };

  useEffect(() => {
    if (!isPlaying || !selectedImage) return undefined;
    const id = setInterval(goToNext, SLIDER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, selectedImage, filteredImages]);

  const gradBg = `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg, var(--app-page-bg))', fontFamily: "var(--font-family, 'Inter', sans-serif)" }}>
      <div style={{ background: gradBg, padding: '16px', paddingTop: 'max(env(safe-area-inset-top,0px),16px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 16px color-mix(in srgb, var(--brand-navy-dark) 18%, transparent)' }}>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={nb.iconBtn}>
          {isMenuOpen ? <X style={{ width: 24, height: 24, color: 'var(--app-button-text, var(--surface-color))' }} /> : <Menu style={{ width: 24, height: 24, color: 'var(--app-button-text, var(--surface-color))' }} />}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedAlbumId && (
            <button
              onClick={() => {
                setSelectedAlbumId(null);
                setAlbumPageImages([]);
                setAlbumTotalPages(0);
                setCurrentPage(1);
              }}
              style={{ ...nb.iconBtn, width: 34, height: 34, background: 'color-mix(in srgb, var(--surface-color) 18%, transparent)', marginRight: 2 }}
            >
              <ArrowLeft style={{ width: 18, height: 18, color: 'var(--app-button-text, var(--surface-color))' }} />
            </button>
          )}
          <span style={{ color: 'var(--app-button-text, var(--surface-color))', fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px' }}>
            {selectedAlbumId ? (selectedAlbum?.name || 'Album') : 'Gallery'}
          </span>
        </div>

        <button onClick={() => navigate('/')} style={nb.iconBtn}>
          <HomeIcon style={{ width: 22, height: 22, color: 'var(--app-button-text, var(--surface-color))' }} />
        </button>
      </div>

      <div style={{ padding: '16px 14px 40px', maxWidth: 520, margin: '0 auto' }}>
        {isLoading && (
          <div style={gl.folderGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ ...gl.folderCard, background: 'color-mix(in srgb, var(--app-accent-bg) 85%, var(--surface-muted))', animation: 'pulse 1.4s ease-in-out infinite' }}>
                <div style={{ height: 160, background: 'color-mix(in srgb, var(--app-accent-bg) 78%, var(--surface-muted))', borderRadius: '16px 16px 0 0' }} />
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ height: 14, width: '65%', background: 'color-mix(in srgb, var(--app-accent-bg) 78%, var(--surface-muted))', borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <ImageIcon style={{ width: 40, height: 40, color: 'var(--body-text-color)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--body-text-color)', fontWeight: 600 }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && !selectedAlbumId && (
          <>
            {albums.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <FolderOpen style={{ width: 48, height: 48, color: 'color-mix(in srgb, var(--body-text-color) 35%, var(--surface-color))', margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--body-text-color)', fontWeight: 600 }}>No albums yet</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16, marginTop: 4 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--heading-color)', margin: 0 }}>Albums</h2>
                  <p style={{ fontSize: 12, color: 'var(--body-text-color)', margin: '4px 0 0', fontWeight: 500 }}>{albums.length} album{albums.length !== 1 ? 's' : ''}</p>
                </div>

                <div style={gl.folderGrid}>
                  {albums.map((album) => {
                    const photos = (album.previewImages || []).slice(0, 2);
                    const count = Number(album.imageCount || 0);
                    return (
                      <div
                        key={album.id}
                        onClick={() => handleAlbumClick(album.id)}
                        style={gl.folderCard}
                        className="gallery-folder-card"
                      >
                        <div style={gl.coverWrap}>
                          <FolderCover photos={photos} folderName={album.name} />
                          <div style={gl.countBadge}>{count} {count === 1 ? 'photo' : 'photos'}</div>
                        </div>

                        <div style={gl.folderMeta}>
                          <div style={gl.folderName}>{album.name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div ref={listBottomRef} style={{ height: 1 }} />
                {isLoadingMoreAlbums && (
                  <div style={{ textAlign: 'center', padding: '14px 0 2px', color: 'var(--body-text-color)', fontSize: 12, fontWeight: 600 }}>
                    Loading more albums...
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!isLoading && !error && selectedAlbumId && (
          <>
            <div style={{ marginBottom: 14, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--body-text-color)', margin: 0, fontWeight: 500 }}>
                  {filteredImages.length} {filteredImages.length === 1 ? 'photo' : 'photos'}
                  {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
                </p>
              </div>
            </div>

            {isAlbumLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ ...gl.photoCard, background: 'color-mix(in srgb, var(--app-accent-bg) 84%, var(--surface-muted))', animation: 'pulse 1.4s ease-in-out infinite' }} />
                ))}
              </div>
            ) : filteredImages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <ImageIcon style={{ width: 40, height: 40, color: 'var(--body-text-color)', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--body-text-color)', fontWeight: 600 }}>No photos in this album</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {filteredImages.map((image, idx) => (
                    <div
                      key={image.id}
                      onClick={() => openLightbox(image)}
                      style={{ ...gl.photoCard, animationDelay: `${idx * 40}ms` }}
                      className="gallery-photo-card"
                    >
                      <img
                        src={image.url}
                        alt={image.title}
                        style={gl.photoImg}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.opacity = '0.15'; }}
                      />
                      <div style={gl.photoOverlay} />
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28 }}>
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ ...pg.btn, ...(currentPage === 1 ? pg.disabled : { background: gradBg, color: 'var(--app-button-text, var(--surface-color))' }) }}
                    >
                      <ChevronLeft style={{ width: 18, height: 18 }} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        style={{ ...pg.pageBtn, ...(currentPage === page ? { background: gradBg, color: 'var(--app-button-text, var(--surface-color))', boxShadow: '0 4px 12px color-mix(in srgb, var(--brand-red) 25%, transparent)' } : {}) }}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{ ...pg.btn, ...(currentPage === totalPages ? pg.disabled : { background: gradBg, color: 'var(--app-button-text, var(--surface-color))' }) }}
                    >
                      <ChevronRight style={{ width: 18, height: 18 }} />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="gallery" />

      {selectedImage && (
        <div style={lb.overlay} onClick={closeLightbox}>
          <button onClick={closeLightbox} style={lb.closeBtn}><X style={{ width: 22, height: 22 }} /></button>

          <button onClick={(e) => { e.stopPropagation(); setIsPlaying((p) => !p); }} style={{ ...lb.closeBtn, left: 16, right: 'auto' }}>
            {isPlaying ? <Pause style={{ width: 20, height: 20 }} /> : <Play style={{ width: 20, height: 20 }} />}
          </button>

          <button onClick={(e) => { e.stopPropagation(); goToPrevious(); }} style={lb.navLeft}><ChevronLeft style={{ width: 26, height: 26 }} /></button>

          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '78vh' }} onClick={(e) => e.stopPropagation()}>
            <img key={selectedImage.id} src={selectedImage.url} alt="Gallery" style={lb.img} />
          </div>

          <button onClick={(e) => { e.stopPropagation(); goToNext(); }} style={lb.navRight}><ChevronRight style={{ width: 26, height: 26 }} /></button>

          <div style={lb.counter}>
            {filteredImages.findIndex((img) => img.id === selectedImage.id) + 1} / {filteredImages.length}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lbFade {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }

        .gallery-folder-card {
          transition: transform 0.28s cubic-bezier(.2,.8,.2,1), box-shadow 0.28s;
        }
        .gallery-folder-card:hover {
          transform: translateY(-5px) scale(1.01);
          box-shadow: 0 16px 40px color-mix(in srgb, var(--brand-navy-dark) 14%, transparent) !important;
        }
        .gallery-folder-card:active {
          transform: scale(0.97);
        }

        .gallery-photo-card {
          animation: fadeInUp 0.38s ease-out both;
          transition: transform 0.22s ease, box-shadow 0.22s;
        }
        .gallery-photo-card:hover {
          transform: scale(1.03);
          box-shadow: 0 10px 28px color-mix(in srgb, var(--brand-navy-dark) 20%, transparent);
        }
        .gallery-photo-card:active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}

const nb = {
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    border: 'none', background: 'color-mix(in srgb, var(--surface-color) 16%, transparent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'background 0.2s',
  },
};

const gl = {
  folderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 14,
  },
  folderCard: {
    borderRadius: 20,
    overflow: 'hidden',
    background: 'color-mix(in srgb, var(--app-accent-bg, var(--surface-color)) 30%, var(--surface-color))',
    boxShadow: '0 4px 20px color-mix(in srgb, var(--brand-navy-dark) 9%, transparent)',
    cursor: 'pointer',
    border: '1px solid color-mix(in srgb, var(--brand-navy) 10%, transparent)',
  },
  coverWrap: {
    position: 'relative',
    height: 154,
    overflow: 'hidden',
    background: 'var(--app-accent-bg)',
  },
  countBadge: {
    position: 'absolute',
    bottom: 8, right: 8,
    background: 'color-mix(in srgb, var(--brand-navy-dark) 62%, transparent)',
    backdropFilter: 'blur(4px)',
    color: 'var(--app-button-text, var(--surface-color))',
    padding: '4px 9px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    zIndex: 5,
    letterSpacing: '0.02em',
  },
  folderMeta: {
    padding: '11px 13px 13px',
  },
  folderName: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--heading-color)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    letterSpacing: '-0.2px',
  },
  folderDesc: {
    fontSize: 11,
    color: 'var(--body-text-color)',
    marginTop: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  photoCard: {
    position: 'relative',
    aspectRatio: '1/1',
    borderRadius: 14,
    overflow: 'hidden',
    background: 'color-mix(in srgb, var(--app-accent-bg) 84%, var(--surface-muted))',
    cursor: 'pointer',
    boxShadow: '0 2px 10px color-mix(in srgb, var(--brand-navy-dark) 8%, transparent)',
  },
  photoImg: {
    width: '100%', height: '100%',
    objectFit: 'cover', display: 'block',
    transition: 'transform 0.35s ease',
  },
  photoOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg,transparent 60%,color-mix(in srgb, var(--brand-navy-dark) 22%, transparent) 100%)',
    pointerEvents: 'none',
  },
};

const lb = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'color-mix(in srgb, var(--brand-navy-dark) 96%, transparent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    width: 44, height: 44, borderRadius: '50%',
    border: 'none', background: 'color-mix(in srgb, var(--surface-color) 12%, transparent)',
    color: 'var(--app-button-text, var(--surface-color))', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)',
  },
  navLeft: {
    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
    width: 44, height: 44, borderRadius: '50%',
    border: 'none', background: 'color-mix(in srgb, var(--surface-color) 12%, transparent)',
    color: 'var(--app-button-text, var(--surface-color))', cursor: 'pointer', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)',
  },
  navRight: {
    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
    width: 44, height: 44, borderRadius: '50%',
    border: 'none', background: 'color-mix(in srgb, var(--surface-color) 12%, transparent)',
    color: 'var(--app-button-text, var(--surface-color))', cursor: 'pointer', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)',
  },
  img: {
    maxWidth: '90vw', maxHeight: '78vh',
    objectFit: 'contain', borderRadius: 16,
    animation: 'lbFade 0.4s ease-out both',
    display: 'block',
  },
  counter: {
    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    padding: '6px 18px', borderRadius: 20,
    background: 'color-mix(in srgb, var(--surface-color) 12%, transparent)',
    backdropFilter: 'blur(6px)',
    color: 'var(--app-button-text, var(--surface-color))', fontSize: 13, fontWeight: 600,
  },
};

const pg = {
  btn: {
    width: 36, height: 36, borderRadius: 10,
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700,
  },
  disabled: { background: 'color-mix(in srgb, var(--app-accent-bg) 84%, var(--surface-muted))', color: 'color-mix(in srgb, var(--body-text-color) 55%, var(--surface-color))', cursor: 'not-allowed' },
  pageBtn: {
    width: 36, height: 36, borderRadius: 10,
    border: 'none', cursor: 'pointer',
    background: 'color-mix(in srgb, var(--app-accent-bg) 84%, var(--surface-muted))', color: 'var(--body-text-color)',
    fontSize: 13, fontWeight: 700,
    transition: 'all 0.18s',
  },
};

export default Gallery;


