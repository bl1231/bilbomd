import { string } from 'yup'

/** Minimum number of characters allowed in a job title. */
export const TITLE_MIN_LENGTH = 4

/** Maximum number of characters allowed in a job title. */
export const TITLE_MAX_LENGTH = 30

/**
 * Shared Yup validation for a BilboMD job title.
 *
 * Every job form enforces identical title rules (length + allowed
 * characters); only the "required" message differs per job type. Pass a job
 * label (e.g. "BilboMD SANS Job") to customize that message.
 *
 * The UI also caps typing at {@link TITLE_MAX_LENGTH} via `TitleField`, so the
 * `.max()` rule here is primarily a backstop for pasted/programmatic input.
 */
export const titleSchema = (jobLabel = 'BilboMD Job') =>
  string()
    .required(`Please provide a title for your ${jobLabel}.`)
    .min(
      TITLE_MIN_LENGTH,
      `Title must contain at least ${TITLE_MIN_LENGTH} characters.`
    )
    .max(
      TITLE_MAX_LENGTH,
      `Title must contain less than ${TITLE_MAX_LENGTH} characters.`
    )
    .matches(/^[\w\s-]+$/, 'No special characters allowed.')
