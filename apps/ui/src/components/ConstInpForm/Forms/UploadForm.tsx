import { ChangeEvent, useEffect, useCallback, useRef, useState } from 'react'
import { CARBOHYDRATE_RESIDUES, readPdbSegments } from '@bilbomd/bilbomd-types'
import { logger } from 'utils/logger'
import { Field, useFormikContext } from 'formik'
import {
  Typography,
  Link,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button
} from '@mui/material'
import Grid from '@mui/material/Grid'
import FileField from '../FormFields/FileField'
import ChainSummary from '../Helpers/ChainSummary'
import ImportNotes from '../Helpers/ImportNotes'
import { pdbTextProblem } from '../Helpers/pdbTextProblem'
import { JIFFY_FILE_ACCEPT, importJiffyFile } from '../Helpers/importJiffyFile'
import {
  EXAMPLE_CONST_INP,
  EXAMPLE_OPENMM_YAML
} from '../Helpers/exampleConstraints'
import Paper from '@mui/material/Paper'
import { useTheme } from '@mui/material/styles'
import useTitle from 'hooks/useTitle'
import { Box } from '@mui/system'
import { Chain, RigidBody, Atom } from 'types/interfaces'
import HeaderBox from 'components/HeaderBox'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
interface AtomsByChain {
  [chainId: string]: Atom[]
}
interface ResidueAtomNames {
  [key: string]: string[] // Each key is a residue identifier, mapping to an array of atom names
}
interface MyFormValues {
  pdb_file: {
    file: File | null
    src: string | null
    name: string
    chains: Chain[]
    rigid_bodies: RigidBody[]
  }
  const_inp_file: {
    file: File | null
    src: string | null
    name: string
    reading: boolean
    notes: string[] | null
  }
}
const proteinResidues = new Set([
  'ALA',
  'CYS',
  'ASP',
  'GLU',
  'PHE',
  'GLY',
  'HIS',
  'ILE',
  'LYS',
  'LEU',
  'MET',
  'ASN',
  'PRO',
  'GLN',
  'ARG',
  'SER',
  'THR',
  'VAL',
  'TRP',
  'TYR'
])
const dnaResidues = new Set([
  'DA',
  'DC',
  'DG',
  'DT',
  'DU',
  'ADE',
  'CYT',
  'GUA',
  'THY'
]) // Deoxyribonucleotides
// const rnaResidues = new Set(['A', 'C', 'G', 'U', 'URA']) // Ribonucleotides
const carbResidues = CARBOHYDRATE_RESIDUES

interface UploadFormProps {
  setStepIsValid(...args: unknown[]): unknown
}

const UploadForm = ({ setStepIsValid }: UploadFormProps) => {
  useTitle('BilboMD: Upload PDB file')
  const theme = useTheme()
  const { values, setFieldValue, setFieldError, isValid, dirty, errors } =
    useFormikContext<MyFormValues>()
  const { name, src, chains, rigid_bodies } = values.pdb_file
  const constInp = values.const_inp_file
  const constInpSrc = constInp.src
  const constInpName = constInp.name
  const constInpNotes = constInp.notes
  // Remounts the constraints file picker on Remove, so it forgets the old file
  const [constInpKey, setConstInpKey] = useState(0)
  // Counts constraints file picks and removals, so a read that finishes after a newer
  // pick or a Remove is ignored instead of bringing back the wrong file
  const constInpRead = useRef(0)

  const parsePdbFile = useCallback(() => {
    const src = values.pdb_file.src
    let atomLines: string[] = []

    if (src !== null && typeof src === 'string') {
      // The schema reports these too, so the error stays through later
      // validations; here they only stop the parse
      const problem = pdbTextProblem(src)
      if (problem) {
        setFieldError('pdb_file.file', problem)
        return
      }
      atomLines = src
        .split('\n')
        .filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'))
    }

    const atoms: Atom[] = atomLines.map((line) => {
      return {
        serial: parseInt(line.substring(6, 11).trim()),
        name: line.substring(12, 16).trim(),
        altLoc: line.substring(16, 17).trim(),
        resName: line.substring(17, 20).trim(),
        chainID: line.substring(21, 22).trim(),
        resSeq: parseInt(line.substring(22, 26).trim()),
        iCode: line.substring(26, 27).trim(),
        x: parseFloat(line.substring(30, 38).trim()),
        y: parseFloat(line.substring(38, 46).trim()),
        z: parseFloat(line.substring(46, 54).trim()),
        occupancy: parseFloat(line.substring(54, 60).trim()),
        tempFactor: parseFloat(line.substring(60, 66).trim()),
        element: line.substring(76, 78).trim(),
        charge: line.substring(78, 80).trim()
      }
    })
    const charmmChains: Chain[] = []
    const demRigidBodies: RigidBody[] = [{ id: 'PRIMARY', domains: [] }]

    const atomsByChain: AtomsByChain = atoms.reduce(
      (acc: AtomsByChain, atom: Atom) => {
        const { chainID } = atom
        if (!acc[chainID]) {
          acc[chainID] = []
        }
        acc[chainID].push(atom)
        return acc
      },
      {}
    )

    Object.entries(atomsByChain).forEach(([chainId, atoms]) => {
      // Ensure atoms are sorted by their residue sequence number
      const sortedAtoms = atoms.sort((a, b) => a.resSeq - b.resSeq)

      const firstAtom = sortedAtoms[0]
      const lastAtom = sortedAtoms[sortedAtoms.length - 1]

      // Use nullish coalescing or other type-safe operations to handle potential undefined values
      const firstRes: number = firstAtom?.resSeq ?? 0
      const lastRes: number = lastAtom?.resSeq ?? 0
      const numResidues: number = lastRes - firstRes + 1

      // Collect atom names for each residue within the chain
      const residueAtomNames = atoms.reduce(
        (acc: ResidueAtomNames, atom: Atom) => {
          const key = `${atom.resName}-${atom.resSeq}`
          if (!acc[key]) acc[key] = []
          acc[key].push(atom.name)
          return acc
        },
        {}
      )

      // Determine chain type
      let chainType = 'Other'
      const resNames = new Set(atoms.map((atom) => atom.resName))

      // Calculate the fraction or percentage of residues that have an O2' atom
      const fractionOfResiduesWithO2Prime =
        Object.values(residueAtomNames).filter((names) => names.includes("O2'"))
          .length / Object.values(residueAtomNames).length

      // Determine if "most" residues have an O2' atom, e.g., more than 50%
      const mostResiduesHaveO2Prime = fractionOfResiduesWithO2Prime > 0.5

      if (mostResiduesHaveO2Prime) {
        chainType = 'RNA'
      } else if (
        Array.from(resNames).some((resName) => proteinResidues.has(resName))
      ) {
        chainType = 'PRO'
      } else if (
        Array.from(resNames).some((resName) => dnaResidues.has(resName))
      ) {
        chainType = 'DNA'
      } else if (
        Array.from(resNames).some((resName) => carbResidues.has(resName))
      ) {
        chainType = 'CAR'
      }

      const charmmChain: Chain = {
        id: chainId,
        atoms: sortedAtoms.length,
        first_res: firstRes,
        last_res: lastRes,
        num_res: numResidues,
        type: chainType,
        domains: [{ start: firstRes, end: lastRes }]
      }
      charmmChains.push(charmmChain)

      demRigidBodies[0]!.domains.push({
        chainid: chainId,
        start: firstRes,
        end: lastRes
      })
    })

    // Start from the uploaded constraints file, if any, instead of whole chains
    const imported = constInpSrc
      ? importJiffyFile(
          constInpSrc,
          constInpName,
          charmmChains,
          // The segments BilboMD builds, so segids resolve to the right chain
          readPdbSegments(src ?? '')
        )
      : null
    const nextRigidBodies = imported ? imported.rigidBodies : demRigidBodies
    const nextNotes = imported ? imported.notes : null

    // Before updating Formik state, check if new data is different from current state
    if (
      JSON.stringify(chains) !== JSON.stringify(charmmChains) ||
      JSON.stringify(rigid_bodies) !== JSON.stringify(nextRigidBodies)
    ) {
      void setFieldValue('pdb_file.chains', charmmChains)
      void setFieldValue('pdb_file.rigid_bodies', nextRigidBodies)
    }
    if (JSON.stringify(constInpNotes) !== JSON.stringify(nextNotes)) {
      void setFieldValue('const_inp_file.notes', nextNotes)
    }
  }, [
    values.pdb_file.src,
    chains,
    rigid_bodies,
    constInpSrc,
    constInpName,
    constInpNotes,
    setFieldError,
    setFieldValue
  ])

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0]
      if (file) {
        void setFieldValue('pdb_file.file', file)
        void setFieldValue('pdb_file.name', file.name)
        const reader = new FileReader()
        reader.onload = () => {
          // Ensure reader.result is a string before setting the value
          if (typeof reader.result === 'string') {
            void setFieldValue('pdb_file.src', reader.result)
          }
          void setFieldValue('pdb_file.name', file.name)
          void setFieldValue('pdb_file.file', file)
        }
        reader.onerror = (error) => {
          logger.error('File reading error:', error)
        }
        reader.readAsText(file)
      }
    }
  }

  const onConstInpChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const read = ++constInpRead.current
    const picked = (src: string | null, reading: boolean) => ({
      file,
      src,
      name: file.name,
      reading,
      notes: null
    })
    void setFieldValue('const_inp_file', picked(null, true))
    const reader = new FileReader()
    reader.onload = () => {
      if (read !== constInpRead.current) return
      const text = typeof reader.result === 'string' ? reader.result : ''
      void setFieldValue('const_inp_file', picked(text, false))
    }
    reader.onerror = (error) => {
      logger.error('File reading error:', error)
      if (read === constInpRead.current) {
        void setFieldValue('const_inp_file', picked('', false))
      }
    }
    reader.readAsText(file)
  }

  const removeConstInp = () => {
    constInpRead.current++
    void setFieldValue('const_inp_file', {
      file: null,
      src: null,
      name: '',
      reading: false,
      notes: null
    })
    setConstInpKey((key) => key + 1)
  }

  useEffect(() => {
    if (src) {
      parsePdbFile()
    }
  }, [src, parsePdbFile])

  // While the file is still being read its error only keeps Next off; it
  // isn't shown
  const constInpError =
    errors.const_inp_file?.file ||
    (constInp.reading ? '' : errors.const_inp_file?.src) ||
    ''

  useEffect(() => {
    setStepIsValid(isValid && dirty)
  }, [isValid, dirty, setStepIsValid])

  const customColors: Record<string, string> = {
    PRO: theme.palette.mode === 'light' ? '#E6A8A8' : '#b76e79',
    DNA: theme.palette.mode === 'light' ? '#E9D8A6' : '#b3a272',
    RNA: theme.palette.mode === 'light' ? '#B5E3D8' : '#6daba4',
    CAR: theme.palette.mode === 'light' ? '#A8CCE6' : '#6b95b8',
    Other: theme.palette.mode === 'light' ? '#D1A8E6' : '#9773b9'
  }
  const macroMolecules = ['PRO', 'DNA', 'RNA', 'CAR', 'Other']
  return (
    <>
      <Grid
        container
        spacing={3}
      >
        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>Instructions</Typography>
          </HeaderBox>

          <Paper sx={{ p: 1 }}>
            <Box>
              <Typography sx={{ m: 1 }}>
                <b>BilboMD</b> runs molecular dynamics in which parts of your
                molecule are held fixed, some parts move as rigid bodies, and
                the rest stays flexible. The <b>Inp Jiffy{'\u2122'}</b> helps
                you define those regions for your PDB file and writes them as a
                constraints file for <b>BilboMD Classic</b> and{' '}
                <b>BilboMD SANS</b> jobs, with either MD engine (OpenMM or
                CHARMM).
              </Typography>
              <ul>
                <li>
                  <Typography>
                    The <b>Inp Jiffy{'\u2122'}</b> will only work with PDB files
                    that have a chain ID (i.e. a single character in column 22).
                  </Typography>
                </li>
                <li>
                  <Typography>
                    The file it writes is a{' '}
                    <b>
                      <code>const.inp</code>
                    </b>
                    , in CHARMM{' '}
                    <Link
                      href="https://academiccharmm.org/documentation/version/c51b1/select"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      atom selection
                    </Link>{' '}
                    syntax, with segid names that BilboMD understands. BilboMD
                    reads it for OpenMM jobs too.
                  </Typography>
                </li>
                <li>
                  <Typography>
                    Already have a constraints file? A <code>const.inp</code>,
                    an OpenMM constraints YAML (such as{' '}
                    <code>openmm_const.yml</code>), or{' '}
                    <code>bilbomd_job.json</code> from a BilboMD results
                    download. Upload it along with your PDB file to start from
                    its fixed and rigid bodies. The <b>Inp Jiffy{'\u2122'}</b>{' '}
                    checks it against the PDB and writes a new file, so comments
                    and names are not kept.
                  </Typography>
                </li>
              </ul>
            </Box>

            {/* Side by side on wide screens; opening one leaves the other's height alone */}
            <Grid
              container
              spacing={1}
              sx={{ alignItems: 'flex-start' }}
            >
              {[
                {
                  fileName: 'const.inp',
                  what: 'CHARMM format',
                  text: EXAMPLE_CONST_INP
                },
                {
                  fileName: 'openmm_const.yml',
                  what: 'OpenMM format',
                  text: EXAMPLE_OPENMM_YAML
                }
              ].map(({ fileName, what, text }) => (
                <Grid
                  key={fileName}
                  size={{ xs: 12, md: 6 }}
                >
                  <Accordion sx={{ backgroundColor: '#f5f5f5' }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography sx={{ m: 1 }}>
                        Example <code>{fileName}</code> file ({what})
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box
                        sx={{
                          backgroundColor:
                            theme.palette.mode === 'light'
                              ? theme.palette.grey[100]
                              : theme.palette.grey[600],
                          m: 1,
                          p: 1
                        }}
                      >
                        <Typography
                          component="pre"
                          data-testid={`example-${fileName}`}
                          sx={{
                            m: 1,
                            fontFamily:
                              'Consolas, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New;'
                          }}
                        >
                          {text}
                        </Typography>
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>File Upload</Typography>
          </HeaderBox>
          <Paper sx={{ p: 1 }}>
            <Grid
              container
              sx={{ flexDirection: 'column' }}
            >
              <Grid size={{ xs: 6 }}>
                <Field
                  name="pdb_file"
                  id="pdb_file"
                  title="Select PDB File"
                  as={FileField}
                  onChange={onChange}
                  setFieldValue={setFieldValue}
                  // Only once a PDB has been picked: picking a constraints file first
                  // validates the whole form, and shouldn't flag an untouched
                  // PDB picker
                  isError={Boolean(errors.pdb_file) && Boolean(name)}
                  errorMessage={
                    errors.pdb_file
                      ? errors.pdb_file.file ||
                        errors.pdb_file.src ||
                        'Error uploading file'
                      : ''
                  }
                  fileExt=".pdb"
                />
              </Grid>
              <Grid
                size={{ xs: 12 }}
                sx={{ mt: 2 }}
              >
                <Typography sx={{ mb: 1 }}>
                  Optional: start from an existing constraints file, a{' '}
                  <code>const.inp</code>, an OpenMM constraints YAML, or{' '}
                  <code>bilbomd_job.json</code> from a BilboMD results download
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Field
                    key={constInpKey}
                    name="const_inp_file.file"
                    id="const_inp_file"
                    title="Select Constraints File"
                    as={FileField}
                    onChange={onConstInpChange}
                    setFieldValue={setFieldValue}
                    isError={Boolean(constInpError)}
                    errorMessage={constInpError}
                    fileExt={JIFFY_FILE_ACCEPT}
                  />
                  {constInp.name && (
                    <Button
                      variant="outlined"
                      onClick={removeConstInp}
                      sx={{ ml: 2, height: '40px' }}
                    >
                      Remove
                    </Button>
                  )}
                </Box>
                {constInpSrc && !constInpError && !name && (
                  <Typography sx={{ m: 1 }}>
                    Upload the PDB file to check <b>{constInp.name}</b> against
                    it.
                  </Typography>
                )}
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        {name && (!errors.pdb_file || !errors.pdb_file.file) && chains ? (
          <Grid size={{ xs: 12 }}>
            <HeaderBox>
              <Typography>Summary</Typography>
            </HeaderBox>

            <Paper sx={{ p: 1 }}>
              <Grid>
                {macroMolecules.map((chain: string, index: number) => (
                  <Chip
                    key={index}
                    label={`${chain}`}
                    sx={{
                      mr: 1,
                      mb: 1,
                      backgroundColor: customColors[chain] || '#9773b9',
                      color: theme.palette.getContrastText(
                        customColors[chain] ?? '#9773b9'
                      )
                    }}
                  />
                ))}
              </Grid>
              <ChainSummary chains={chains}></ChainSummary>
              {constInpNotes && !constInpError && (
                <ImportNotes
                  name={constInp.name}
                  notes={constInpNotes}
                />
              )}
            </Paper>
          </Grid>
        ) : (
          ''
        )}
      </Grid>
    </>
  )
}

export default UploadForm
//
