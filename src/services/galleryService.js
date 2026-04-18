import { supabase } from './supabaseClient';

const TABLE = 'gallery_photos';
const FOLDERS_TABLE = 'gallery_folders';
const BUCKET = 'gallery';
export const UNASSIGNED_FOLDER_ID = 'unassigned';
const GALLERY_CACHE_PREFIX = 'latest_gallery_cache_v1';
const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const resolveLatestGalleryCacheKey = (trustId = null, limit = 6) => {
  const trustKey = trustId ? String(trustId) : 'global';
  return `${GALLERY_CACHE_PREFIX}:${trustKey}:${limit}`;
};

export const getCachedLatestGalleryImages = (trustId = null, limit = 6) => {
  try {
    const raw = sessionStorage.getItem(resolveLatestGalleryCacheKey(trustId, limit));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.data)) return [];
    if (Date.now() - parsed.ts > GALLERY_CACHE_TTL_MS) return [];
    return parsed.data;
  } catch {
    return [];
  }
};

const setCachedLatestGalleryImages = (trustId = null, limit = 6, data = []) => {
  try {
    sessionStorage.setItem(
      resolveLatestGalleryCacheKey(trustId, limit),
      JSON.stringify({ ts: Date.now(), data: Array.isArray(data) ? data : [] })
    );
  } catch {
    // ignore cache failures
  }
};

function getPublicUrl(storagePath) {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

function buildPublicUrl(storagePath) {
  if (!storagePath) return null;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const base = supabaseUrl.replace(/\/$/, '');
  let path = storagePath.replace(/^\/+/, '');
  if (path.startsWith(`${BUCKET}/`)) {
    path = path.slice(BUCKET.length + 1);
  }
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${BUCKET}/${encodedPath}`;
}

function getDisplayName(storagePath) {
  if (!storagePath) return 'Gallery Photo';
  const file = storagePath.split('/').pop() || storagePath;
  const cleaned = file.replace(/^\d+_/, '');
  return cleaned || 'Gallery Photo';
}

function mapRowToImage(row) {
  const folder = row.gallery_folders || row.folder || null;
  const folderName = folder?.name || 'General';
  const rawFolderId = row.folder_id || folder?.id || null;
  const resolvedFolderId = rawFolderId || UNASSIGNED_FOLDER_ID;
  const resolvedTrustId = folder?.trust_id || null;
  const isHttpPath = typeof row.storage_path === 'string' && /^https?:\/\//i.test(row.storage_path);
  const resolvedUrl = row.public_url
    || (isHttpPath ? row.storage_path : null)
    || buildPublicUrl(row.storage_path)
    || getPublicUrl(row.storage_path);
  return {
    id: row.id,
    url: resolvedUrl,
    title: getDisplayName(row.storage_path),
    folderId: resolvedFolderId,
    folderName,
    createdAt: row.created_at,
    storagePath: row.storage_path,
    trustId: resolvedTrustId
  };
}

// Upload photo to Supabase Storage and save metadata to database
export async function uploadGalleryPhoto(file, _originalName = null, folderId = null, trustId = null) {
  try {
    if (!file) throw new Error('No file provided');

    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const storagePath = fileName;

    // Upload file to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get user info
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    // Save metadata to gallery_photos table
    const { data: insertData, error: insertError } = await supabase
      .from(TABLE)
      .insert([
        {
          storage_path: storagePath,
          public_url: urlData?.publicUrl || null,
          uploaded_by: userId,
          folder_id: folderId
        }
      ])
      .select();

    if (insertError) throw insertError;

    return {
      success: true,
      photo: insertData[0],
      message: 'Photo uploaded successfully'
    };
  } catch (error) {
    console.error('Error uploading photo:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to upload photo'
    };
  }
}

// Fetch all gallery folders from gallery_folders table
export async function fetchGalleryFolders(trustId = null) {
  try {
    let query = supabase
      .from(FOLDERS_TABLE)
      .select('id, name, description, trust_id')
      .order('name', { ascending: true });

    if (trustId) {
      query = query.eq('trust_id', trustId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching folders:', err);
    return [];
  }
}

// Fetch images by folder
export async function fetchImagesByFolder(folderId = null, trustId = null) {
  try {
    const joinSelect = trustId
      ? 'id, storage_path, folder_id, created_at, public_url, gallery_folders!inner ( id, name, trust_id )'
      : 'id, storage_path, folder_id, created_at, public_url, gallery_folders ( id, name, trust_id )';
    let query = supabase
      .from(TABLE)
      .select(joinSelect);

    if (folderId) {
      if (folderId === UNASSIGNED_FOLDER_ID) {
        query = query.is('folder_id', null);
      } else {
        query = query.eq('folder_id', folderId);
      }
    }
    if (trustId) {
      query = query.eq('gallery_folders.trust_id', trustId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapRowToImage).filter((img) => img.url);
  } catch (err) {
    console.error('Error fetching images by folder:', err);
    return [];
  }
}

// Fetch latest gallery images from database
export async function fetchLatestGalleryImages(limit = 6, trustId = null, opts = {}) {
  const preferCache = opts?.preferCache !== false;
  if (preferCache) {
    const cached = getCachedLatestGalleryImages(trustId, limit);
    if (cached.length > 0) return cached;
  }

  const joinSelect = trustId
    ? 'id, storage_path, folder_id, created_at, public_url, gallery_folders!inner ( id, name, trust_id )'
    : 'id, storage_path, folder_id, created_at, public_url, gallery_folders ( id, name, trust_id )';
  let query = supabase
    .from(TABLE)
    .select(joinSelect)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (trustId) {
    query = query.eq('gallery_folders.trust_id', trustId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const mapped = (data || []).map(mapRowToImage).filter((img) => img.url);
  setCachedLatestGalleryImages(trustId, limit, mapped);
  return mapped;
}

// Fetch all gallery images from database
export async function fetchAllGalleryImages(trustId = null) {
  const joinSelect = trustId
    ? 'id, storage_path, folder_id, created_at, public_url, gallery_folders!inner ( id, name, trust_id )'
    : 'id, storage_path, folder_id, created_at, public_url, gallery_folders ( id, name, trust_id )';
  let query = supabase
    .from(TABLE)
    .select(joinSelect)
    .order('created_at', { ascending: false });

  if (trustId) {
    query = query.eq('gallery_folders.trust_id', trustId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapRowToImage).filter((img) => img.url);
}

