import { getSponsorById, getSponsors } from './api';

/**
 * Centralized Sponsor Store (ID normalized)
 *
 * Per trust:
 * - sponsorsById: { [id]: sponsorObject }
 * - sponsorOrder: [id1, id2, ...]
 * - sponsorBatchesLoaded: [0,1,2,...]
 * - sponsorListPages: { [pageNo]: { ids, ts } }
 * - carouselBatches: { [batchNo]: [id, ...] }
 * - hasMoreSponsors: boolean
 * - isLoadingBatch: boolean
 * - nextBatchIndex: number
 *
 * Global:
 * - sponsorDetailsCache: { [id]: { data, ts } }
 */

const TTL_CAROUSEL_MS = 15 * 60 * 1000;
const TTL_LIST_PAGE_MS = 15 * 60 * 1000;
const TTL_DETAIL_MS = 12 * 60 * 1000;

export const sponsorConfig = {
  CAROUSEL_BATCH_SIZE: 6,
  LIST_PAGE_SIZE: 10,
  CAROUSEL_SLIDE_SECONDS: 5
};

const KEY_BY_ID = (trustId) => `sp_by_id_v3_${trustId}`;
const KEY_ORDER = (trustId) => `sp_order_v3_${trustId}`;
const KEY_LIST_PAGES = (trustId) => `sp_list_pages_v3_${trustId}`;
const KEY_CAROUSEL_BATCHES = (trustId) => `sp_carousel_batches_v3_${trustId}`;
const KEY_CAROUSEL_STATE = (trustId) => `sp_carousel_state_v3_${trustId}`;
const KEY_PINNED_ID = (trustId) => `sp_pinned_id_v3_${trustId}`;
const KEY_DETAIL_CACHE = 'sp_detail_cache_v3';
const sponsorDebugByTrust = {};
const memorySponsorsById = {};
const memorySponsorOrder = {};

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage failures
  }
};

const now = () => Date.now();
const isFresh = (ts, ttl) => Number(ts) > 0 && now() - Number(ts) < ttl;

const normalizeId = (value) => {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
};

export function getSponsorDebugInfo(trustId) {
  const normalizedTrustId = normalizeId(trustId);
  if (!normalizedTrustId) return null;
  return sponsorDebugByTrust[normalizedTrustId] || null;
}

const normalizeSponsor = (value) => {
  const id = normalizeId(value?.id);
  if (!id) return null;
  return { ...(value || {}), id };
};

const toUniqueSortedBatchNos = (arr) => {
  const set = new Set();
  for (const value of Array.isArray(arr) ? arr : []) {
    const batchNo = Number(value);
    if (!Number.isFinite(batchNo) || batchNo < 0) continue;
    set.add(batchNo);
  }
  return [...set].sort((a, b) => a - b);
};

function readSponsorsByIdMap(trustId) {
  const persisted = readJson(KEY_BY_ID(trustId), {});
  const persistedKeys = persisted && typeof persisted === 'object' ? Object.keys(persisted) : [];
  if (persistedKeys.length > 0) {
    memorySponsorsById[trustId] = persisted;
    return persisted;
  }
  return memorySponsorsById[trustId] || {};
}

function readSponsorOrderIds(trustId) {
  const persisted = readJson(KEY_ORDER(trustId), []);
  if (Array.isArray(persisted) && persisted.length > 0) {
    memorySponsorOrder[trustId] = persisted;
    return persisted;
  }
  return Array.isArray(memorySponsorOrder[trustId]) ? memorySponsorOrder[trustId] : [];
}

function readListPagesMap(trustId) {
  return readJson(KEY_LIST_PAGES(trustId), {});
}

function readCarouselBatchesMap(trustId) {
  return readJson(KEY_CAROUSEL_BATCHES(trustId), {});
}

function getDefaultCarouselState() {
  return {
    sponsorBatchesLoaded: [],
    hasMoreSponsors: true,
    isLoadingBatch: false,
    nextBatchIndex: 0,
    batchTs: {}
  };
}

function readCarouselState(trustId) {
  const raw = readJson(KEY_CAROUSEL_STATE(trustId), getDefaultCarouselState());
  const merged = { ...getDefaultCarouselState(), ...(raw || {}) };
  merged.sponsorBatchesLoaded = toUniqueSortedBatchNos(merged.sponsorBatchesLoaded);
  merged.nextBatchIndex =
    Number.isFinite(Number(merged.nextBatchIndex)) && Number(merged.nextBatchIndex) >= 0
      ? Number(merged.nextBatchIndex)
      : (merged.sponsorBatchesLoaded.length ? Math.max(...merged.sponsorBatchesLoaded) + 1 : 0);
  merged.batchTs = merged.batchTs && typeof merged.batchTs === 'object' ? merged.batchTs : {};
  merged.hasMoreSponsors = Boolean(merged.hasMoreSponsors);
  merged.isLoadingBatch = Boolean(merged.isLoadingBatch);
  return merged;
}

function writeCarouselState(trustId, partial) {
  const current = readCarouselState(trustId);
  const next = { ...current, ...(partial || {}) };
  if (partial && Object.prototype.hasOwnProperty.call(partial, 'sponsorBatchesLoaded')) {
    next.sponsorBatchesLoaded = toUniqueSortedBatchNos(partial.sponsorBatchesLoaded);
  } else {
    next.sponsorBatchesLoaded = toUniqueSortedBatchNos(next.sponsorBatchesLoaded);
  }
  next.nextBatchIndex =
    next.sponsorBatchesLoaded.length > 0
      ? Math.max(...next.sponsorBatchesLoaded) + 1
      : 0;
  writeJson(KEY_CAROUSEL_STATE(trustId), next);
  return next;
}

function readSponsorObjectsForIds(trustId, ids) {
  const byId = readSponsorsByIdMap(trustId);
  return (ids || []).map((id) => byId[String(id)]).filter(Boolean);
}

export function mergeByIdAndAppendOrder(trustId, sponsorList) {
  const byId = readSponsorsByIdMap(trustId);
  const order = readSponsorOrderIds(trustId);
  const orderSet = new Set(order.map(String));
  const newIds = [];

  for (const item of Array.isArray(sponsorList) ? sponsorList : []) {
    const normalized = normalizeSponsor(item);
    if (!normalized) continue;
    const id = normalized.id;
    byId[id] = { ...byId[id], ...normalized };

    if (!orderSet.has(id)) {
      orderSet.add(id);
      order.push(id);
      newIds.push(id);
    }
  }

  writeJson(KEY_BY_ID(trustId), byId);
  writeJson(KEY_ORDER(trustId), order);
  memorySponsorsById[trustId] = byId;
  memorySponsorOrder[trustId] = order;

  return { byId, order, newIds };
}

function warmImageCache(sponsors) {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  for (const sponsor of Array.isArray(sponsors) ? sponsors : []) {
    const src = sponsor?.photo_thumb_url || sponsor?.photo_url;
    if (!src) continue;
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    } catch {
      // ignore image preload errors
    }
  }
}

export function readSponsorsById(trustId) {
  return readSponsorsByIdMap(trustId);
}

export function readSponsorOrder(trustId) {
  return readSponsorOrderIds(trustId);
}

export function readCarouselProgress(trustId) {
  const state = readCarouselState(trustId);
  return {
    sponsorBatchesLoaded: state.sponsorBatchesLoaded,
    hasMoreSponsors: state.hasMoreSponsors,
    isLoadingBatch: state.isLoadingBatch,
    nextBatchIndex: state.nextBatchIndex
  };
}

export function getSponsorFromCache(trustId, sponsorId) {
  const id = normalizeId(sponsorId);
  if (!trustId || !id) return null;
  return readSponsorsByIdMap(trustId)[id] || null;
}

export function readDetailCache(sponsorId) {
  const id = normalizeId(sponsorId);
  if (!id) return { detail: null, isFresh: false };
  const cache = readJson(KEY_DETAIL_CACHE, {});
  const entry = cache[id];
  if (!entry) return { detail: null, isFresh: false };
  return { detail: entry.data || null, isFresh: isFresh(entry.ts, TTL_DETAIL_MS) };
}

export function mergeSponsorBatch(trustId, batchNo, sponsorList, options = {}) {
  if (!trustId) return { newIds: [], allOrder: [] };

  const normalizedBatchNo = Number(batchNo);
  if (!Number.isFinite(normalizedBatchNo) || normalizedBatchNo < 0) {
    return { newIds: [], allOrder: readSponsorOrderIds(trustId) };
  }

  const list = Array.isArray(sponsorList) ? sponsorList : [];
  const merged = mergeByIdAndAppendOrder(trustId, list);
  const batchIds = list.map((item) => normalizeId(item?.id)).filter(Boolean);

  const batches = readCarouselBatchesMap(trustId);
  batches[String(normalizedBatchNo)] = batchIds;
  writeJson(KEY_CAROUSEL_BATCHES(trustId), batches);

  const previousState = readCarouselState(trustId);
  const nextLoaded = toUniqueSortedBatchNos([
    ...previousState.sponsorBatchesLoaded,
    normalizedBatchNo
  ]);
  const nextBatchTs = { ...(previousState.batchTs || {}), [String(normalizedBatchNo)]: now() };
  const nextHasMore =
    typeof options.hasMore === 'boolean'
      ? options.hasMore
      : previousState.hasMoreSponsors;

  writeCarouselState(trustId, {
    sponsorBatchesLoaded: nextLoaded,
    hasMoreSponsors: nextHasMore,
    isLoadingBatch: false,
    batchTs: nextBatchTs
  });

  return { newIds: merged.newIds, allOrder: merged.order };
}

export function saveListPage(trustId, page, sponsorList) {
  if (!trustId) return;
  const pageNo = Number(page);
  if (!Number.isFinite(pageNo) || pageNo <= 0) return;

  const list = Array.isArray(sponsorList) ? sponsorList : [];
  mergeByIdAndAppendOrder(trustId, list);

  const pages = readListPagesMap(trustId);
  pages[pageNo] = {
    ids: list.map((item) => normalizeId(item?.id)).filter(Boolean),
    ts: now()
  };
  writeJson(KEY_LIST_PAGES(trustId), pages);
}

export function saveDetailCache(sponsorId, detail) {
  const id = normalizeId(sponsorId);
  if (!id || !detail) return;
  const cache = readJson(KEY_DETAIL_CACHE, {});
  cache[id] = { data: { ...detail, id }, ts: now() };
  writeJson(KEY_DETAIL_CACHE, cache);
}

export function buildOrderedSponsors(trustId) {
  const order = readSponsorOrderIds(trustId);
  return readSponsorObjectsForIds(trustId, order);
}

export function clearSponsorCache(trustId) {
  if (!trustId) return;
  try {
    localStorage.removeItem(KEY_BY_ID(trustId));
    localStorage.removeItem(KEY_ORDER(trustId));
    localStorage.removeItem(KEY_LIST_PAGES(trustId));
    localStorage.removeItem(KEY_CAROUSEL_BATCHES(trustId));
    localStorage.removeItem(KEY_CAROUSEL_STATE(trustId));
  } catch {
    // ignore
  }
  delete memorySponsorsById[trustId];
  delete memorySponsorOrder[trustId];
}

export function setPinnedSponsor(trustId, sponsor) {
  const candidateId = sponsor && typeof sponsor === 'object' ? sponsor.id : sponsor;
  const id = normalizeId(candidateId);
  if (!id) return;
  if (trustId) {
    writeJson(KEY_PINNED_ID(trustId), id);
  }
  setSelectedSponsorId(id);
}

export function readPinnedSponsorId(trustId) {
  if (!trustId) return null;
  return normalizeId(readJson(KEY_PINNED_ID(trustId), null));
}

export function clearPinnedSponsor(trustId) {
  if (!trustId) return;
  try {
    localStorage.removeItem(KEY_PINNED_ID(trustId));
  } catch {
    // ignore
  }
}

export function readSelectedSponsorId() {
  try {
    return normalizeId(sessionStorage.getItem('selectedSponsorId'));
  } catch {
    return null;
  }
}

export function setSelectedSponsorId(id) {
  const normalized = normalizeId(id);
  if (!normalized) return;
  try {
    sessionStorage.setItem('selectedSponsorId', normalized);
  } catch {
    // ignore
  }
}

export function getCachedCarouselBatch(trustId, batchIndex) {
  const batchNo = String(Number(batchIndex));
  const batches = readCarouselBatchesMap(trustId);
  const ids = Array.isArray(batches[batchNo]) ? batches[batchNo] : [];
  const state = readCarouselState(trustId);
  const ts = state.batchTs?.[batchNo] || 0;

  return {
    ids,
    sponsors: readSponsorObjectsForIds(trustId, ids),
    isFresh: isFresh(ts, TTL_CAROUSEL_MS)
  };
}

export async function getCarouselBatch({ trustId, batchIndex, batchSize = sponsorConfig.CAROUSEL_BATCH_SIZE }) {
  const normalizedBatch = Number(batchIndex);
  const limit = Number(batchSize) || sponsorConfig.CAROUSEL_BATCH_SIZE;
  if (!trustId || !Number.isFinite(normalizedBatch) || normalizedBatch < 0) {
    return { sponsors: [], hasMore: false };
  }

  const cached = getCachedCarouselBatch(trustId, normalizedBatch);
  const state = readCarouselState(trustId);
  if (cached.sponsors.length > 0 && cached.isFresh) {
    const loaded = state.sponsorBatchesLoaded.includes(normalizedBatch)
      ? state.sponsorBatchesLoaded
      : [...state.sponsorBatchesLoaded, normalizedBatch];
    writeCarouselState(trustId, {
      sponsorBatchesLoaded: loaded,
      isLoadingBatch: false
    });
    return { sponsors: cached.sponsors, hasMore: state.hasMoreSponsors };
  }

  writeCarouselState(trustId, { isLoadingBatch: true });

  const offset = normalizedBatch * limit;
  let hasMore = true;
  let sponsors = [];
  let scans = 0;
  const maxScans = 8;

  while (scans < maxScans) {
    const res = await getSponsors(trustId, null, { offset: offset + (scans * limit), limit, view: 'carousel' });
    if (trustId) {
      sponsorDebugByTrust[String(trustId)] = res?.debug || null;
    }
    sponsors = Array.isArray(res?.data) ? res.data : [];
    hasMore = typeof res?.hasMore === 'boolean' ? res.hasMore : sponsors.length === limit;

    if (sponsors.length > 0) break;
    if (!hasMore) break;
    scans += 1;
  }

  mergeSponsorBatch(trustId, normalizedBatch, sponsors, { hasMore });
  warmImageCache(sponsors);

  return { sponsors, hasMore };
}

export async function preloadCarouselBatchImages({ trustId, batchIndex }) {
  const cached = getCachedCarouselBatch(trustId, batchIndex);
  if (cached.sponsors.length > 0) {
    warmImageCache(cached.sponsors);
    if (cached.isFresh) {
      const progress = readCarouselProgress(trustId);
      return { sponsors: cached.sponsors, hasMore: progress.hasMoreSponsors };
    }
  }
  return getCarouselBatch({ trustId, batchIndex, batchSize: sponsorConfig.CAROUSEL_BATCH_SIZE });
}

export async function prefetchCarouselBatch({ trustId, batchIndex }) {
  return getCarouselBatch({ trustId, batchIndex, batchSize: sponsorConfig.CAROUSEL_BATCH_SIZE });
}

export function getCachedListPage(trustId, page) {
  const pageNo = Number(page);
  const entry = readListPagesMap(trustId)[pageNo];
  if (!entry) return { sponsors: [], ids: [], isFresh: false };
  const ids = Array.isArray(entry.ids) ? entry.ids : [];
  return {
    ids,
    sponsors: readSponsorObjectsForIds(trustId, ids),
    isFresh: isFresh(entry.ts, TTL_LIST_PAGE_MS)
  };
}

export async function getListPage({ trustId, page = 1, pageSize = sponsorConfig.LIST_PAGE_SIZE }) {
  const pageNo = Number(page) || 1;
  const limit = Number(pageSize) || sponsorConfig.LIST_PAGE_SIZE;
  const cached = getCachedListPage(trustId, pageNo);

  // Only use cache if it's fresh AND has at least as many items as the page size.
  // If cached count < limit, the cache may be stale/partial — re-fetch from API.
  if (cached.sponsors.length >= limit && cached.isFresh) {
    return { sponsors: cached.sponsors, hasMore: true };
  }

  const res = await getSponsors(trustId, null, { page: pageNo, limit, view: 'list' });
  if (trustId) {
    sponsorDebugByTrust[String(trustId)] = res?.debug || null;
  }
  const sponsors = Array.isArray(res?.data) ? res.data : [];

  saveListPage(trustId, pageNo, sponsors);

  const hasMore = typeof res?.hasMore === 'boolean' ? res.hasMore : sponsors.length === limit;
  return { sponsors, hasMore };
}

export function flattenListPages(trustId, pages, includePinned = false) {
  const byId = readSponsorsByIdMap(trustId);
  const listPages = readListPagesMap(trustId);
  const mergedIds = [];
  const seen = new Set();

  for (const page of Array.isArray(pages) ? pages : []) {
    const pageNo = Number(page);
    const ids = listPages[pageNo]?.ids || [];
    for (const id of ids) {
      const normalized = normalizeId(id);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      mergedIds.push(normalized);
    }
  }

  if (includePinned) {
    const pinnedId = readPinnedSponsorId(trustId) || readSelectedSponsorId();
    if (pinnedId && byId[pinnedId]) {
      const rest = mergedIds.filter((id) => id !== pinnedId);
      mergedIds.length = 0;
      mergedIds.push(pinnedId, ...rest);
    }
  }

  return mergedIds.map((id) => byId[id]).filter(Boolean);
}

export async function preloadSponsorListFirstPage(trustId) {
  if (!trustId) return;
  const cached = getCachedListPage(trustId, 1);
  if (cached.sponsors.length > 0 && cached.isFresh) return;
  await getListPage({ trustId, page: 1, pageSize: sponsorConfig.LIST_PAGE_SIZE });
}

export async function getSponsorListTotalCount(trustId) {
  if (!trustId) return 0;
  let page = 1;
  let total = 0;
  let hasMore = true;

  while (hasMore && page <= 100) {
    const res = await getSponsors(trustId, null, { page, limit: sponsorConfig.LIST_PAGE_SIZE, view: 'list' });
    const sponsors = Array.isArray(res?.data) ? res.data : [];
    if (sponsors.length === 0) {
      hasMore = false;
      break;
    }
    total += sponsors.length;
    hasMore = typeof res?.hasMore === 'boolean' ? res.hasMore : sponsors.length === sponsorConfig.LIST_PAGE_SIZE;
    page += 1;
  }

  return total;
}

export function getCachedSponsorById(sponsorId, trustId = null) {
  const id = normalizeId(sponsorId);
  if (!id) return null;

  if (trustId) {
    const direct = readSponsorsByIdMap(trustId)[id];
    if (direct) return direct;
  }

  const trustKeyPrefix = 'sp_by_id_v3_';
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(trustKeyPrefix)) continue;
      const byId = readJson(key, {});
      if (byId[id]) return byId[id];
    }
  } catch {
    // ignore storage iteration errors
  }
  return null;
}

export function getCachedSponsorDetail(sponsorId) {
  return readDetailCache(sponsorId);
}

export async function getSponsorDetail({ sponsorId, trustId = null }) {
  const id = normalizeId(sponsorId);
  if (!id) return null;

  const cachedDetail = readDetailCache(id);
  if (cachedDetail.detail && cachedDetail.isFresh) {
    return cachedDetail.detail;
  }

  const sponsorMeta = getCachedSponsorById(id, trustId);
  if (sponsorMeta && !cachedDetail.detail) {
    saveDetailCache(id, sponsorMeta);
  }

  const res = await getSponsorById(id);
  const detail = Array.isArray(res?.data) ? res.data[0] : null;
  if (!detail) return sponsorMeta || cachedDetail.detail || null;

  saveDetailCache(id, detail);
  if (trustId) {
    mergeByIdAndAppendOrder(trustId, [detail]);
  }

  return detail;
}
