import { object, string } from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  jsonFileCheck,
  pdbOrCifExtTest,
  pdbOrCifChainIdCheck,
  pdbOrCifResidueCheck,
  singleModelCheck
} from './fieldTests/fieldTests'

const BilboMDAutoJobSchema = object().shape({
  md_engine: string()
    .oneOf(['charmm', 'openmm'], 'Invalid MD engine')
    .required('Please select an MD engine'),
  title: string()
    .required('Please provide a title for your BilboMD Job.')
    .min(4, 'Title must contain at least 4 characters.')
    .max(30, 'Title must contain less than 30 characters.')
    .matches(/^[\w\s-]+$/, 'no spaces or special characters allowed'),
  pdb_file: requiredFile('A PDB or CIF file is required')
    .concat(pdbOrCifChainIdCheck())
    .concat(singleModelCheck())
    .concat(pdbOrCifResidueCheck())
    .concat(pdbOrCifExtTest())
    .concat(fileSizeTest(10_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  pae_file: requiredFile('A PAE *.json file is required')
    .concat(jsonFileCheck())
    .concat(fileExtTest('json'))
    .concat(fileSizeTest(120_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(saxsCheck())
    .concat(fileExtTest('dat'))
    .concat(fileSizeTest(2_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest())
})

export { BilboMDAutoJobSchema }
