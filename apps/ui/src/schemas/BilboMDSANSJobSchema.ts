import { object, string, number } from 'yup'
import {
  requiredFile,
  pdbOrCifExtTest,
  pdbOrCifChainIdCheck,
  pdbOrCifResidueCheck,
  singleModelCheck,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  fileExtTest,
  constInpCheck
} from './fieldTests/fieldTests'

const BilboMDSANSJobSchema = object().shape({
  md_engine: string()
    .oneOf(['charmm', 'openmm'], 'Invalid MD engine')
    .required('Please select an MD engine'),
  title: string()
    .required('Please provide a title for your BilboMD SANS Job.')
    .min(4, 'Title must contain at least 4 characters.')
    .max(30, 'Title must contain less than 30 characters.')
    .matches(/^[\w\s-]+$/, 'No special characters allowed'),
  pdb_file: requiredFile('A PDB or CIF file is required')
    .concat(pdbOrCifChainIdCheck())
    .concat(singleModelCheck())
    .concat(pdbOrCifResidueCheck())
    .concat(pdbOrCifExtTest())
    .concat(fileSizeTest(20_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  dat_file: requiredFile('Experimental SANS data is required')
    .concat(saxsCheck())
    .concat(fileExtTest('dat'))
    .concat(fileSizeTest(2_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  rg_min: number()
    .integer()
    .positive()
    .min(10)
    .max(100)
    .required('Please provide a Minimum Rg value'),
  rg_max: number()
    .integer()
    .positive()
    .min(10)
    .max(100)
    .required('Please provide a Maximum Rg value')
    .test(
      'is-greater',
      'Rg Maximum must be at least 1 Å greater than Rg Minimum',
      function (value) {
        const { rg_min } = this.parent
        return value > rg_min
      }
    ),
  inp_file: requiredFile('const.inp file is required')
    .concat(fileExtTest('inp'))
    .concat(constInpCheck())
    .concat(fileSizeTest(2_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  d2o_fraction: number()
    .min(0, 'D2O Fraction cannot be less than 0')
    .max(100, 'D2O Fraction cannot be more than 100')
    .required('D2O Fraction is required')
})

export { BilboMDSANSJobSchema }
