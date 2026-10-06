import { SAXS_MAX_FILE_SIZE } from '@bilbomd/bilbomd-types'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  sansCheck
} from './fieldTests/fieldTests'

// Checks on the file itself (name, extension, size), without reading it
const expdataFileSchema = requiredFile('Experimental SAXS data is required')
  .concat(fileExtTest('dat'))
  .concat(fileSizeTest(SAXS_MAX_FILE_SIZE))
  .concat(noSpacesTest())
  .concat(fileNameLengthTest())

const expdataSchema = saxsCheck().concat(expdataFileSchema)

const sansExpdataSchema = sansCheck().concat(expdataFileSchema)

export { expdataFileSchema, expdataSchema, sansExpdataSchema }
