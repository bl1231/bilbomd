import { useGetConfigsQuery, ConfigLicense } from 'slices/configsApiSlice'

/**
 * Whether this BilboMD installation has a valid license. Job submission is
 * blocked server-side when it doesn't (see the backend requireValidLicense
 * middleware); forms use this to disable their Submit button so users don't
 * fill out a form only to hit a 403.
 *
 * Fails open: returns true unless the license is positively known to be
 * invalid (config not loaded yet, or an older backend that omits `license`,
 * both leave Submit enabled — the server remains the real gate).
 */
const useLicenseValid = (): boolean => {
  const { data: config } = useGetConfigsQuery('configData')
  const license = config?.license as unknown as ConfigLicense | undefined
  return !license || license.status === 'valid'
}

/**
 * Approximate rendered height (px) of the single-line license banner. Layouts
 * offset page content (and the side nav) down by this amount when the banner is
 * showing, since the banner itself is position: fixed and out of normal flow.
 */
export const LICENSE_BANNER_HEIGHT = 48

/**
 * Whether the license banner should render — i.e. the license is positively
 * known to be invalid. The inverse of useLicenseValid (which fails open), so
 * the banner only appears once config has loaded and reports a non-valid state.
 */
export const useLicenseBannerVisible = (): boolean => !useLicenseValid()

export default useLicenseValid
