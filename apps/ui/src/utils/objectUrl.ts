// RTK Query state must stay serializable, so image endpoints store an object
// URL rather than the Blob. Pass this to onCacheEntryAdded to release the
// Blob once the cache entry is dropped.
export const revokeObjectUrlOnRemove = async (
  _arg: unknown,
  api: {
    cacheDataLoaded: Promise<{ data: string }>
    cacheEntryRemoved: Promise<unknown>
  }
) => {
  try {
    const { data } = await api.cacheDataLoaded
    await api.cacheEntryRemoved
    URL.revokeObjectURL(data)
  } catch {
    // The entry was removed before the image loaded, so nothing to revoke
  }
}
