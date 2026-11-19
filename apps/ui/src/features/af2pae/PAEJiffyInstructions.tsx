import { Typography, Link } from '@mui/material'
import InstructionsAccordion from 'components/InstructionsAccordion'

const PAEJiffyInstructions = () => (
  <InstructionsAccordion>
    <Typography sx={{ mx: 1 }}>
      The <b>PAE Jiffy</b>
      {'\u2122'} will use the{' '}
      <Link
        href="https://alphafold.ebi.ac.uk/faq#faq-13"
        target="_blank"
        rel="noopener noreferrer"
      >
        Predicted Aligned Error
      </Link>{' '}
      (PAE) file - in JSON format - from AlphaFold to <b>automagically*</b>{' '}
      define the fixed and rigid bodies of your model; every residue in neither
      stays flexible during MD. The model (<b>*.pdb</b> or <b>*.cif</b>) and PAE{' '}
      <b>*.json</b> files must be the ones obtained from AlphaFold since we are
      also using the{' '}
      <Link
        href="https://alphafold.ebi.ac.uk/faq#faq-12"
        target="_blank"
        rel="noopener noreferrer"
      >
        pLDDT
      </Link>{' '}
      values stored in the B-factor column to guide the selection of rigid and
      flexible regions.
    </Typography>
    <Typography
      component={'span'}
      variant={'body1'}
    >
      <ol>
        <li>
          Obtain the PAE file from AlphaFold2 or AlphaFold-Multimer. Either from
          running AlphaFold on your own in a colabfold notebook or downloaded
          from pre-predicted structures available from the{' '}
          <Link
            href="https://alphafold.ebi.ac.uk/"
            target="_blank"
            rel="noopener noreferrer"
          >
            AlphaFold
          </Link>{' '}
          database hosted at EMBL-EBI.
        </li>
        <li>
          Upload the files here and our server will work out the fixed and rigid
          bodies for you. Check that they make sense, then take them straight
          into a new <b>BilboMD Classic</b> job, or download them as a{' '}
          <code>const.inp</code> or an <code>openmm_const.yml</code>. Either
          file works for a <b>BilboMD Classic</b> or <b>BilboMD SANS</b> job
          that starts from a PDB file. For a CHARMM job from CRD/PSF files, use
          the <code>const.inp</code>; its segids must match those in your PSF.
        </li>
      </ol>
    </Typography>
    <Typography>
      *The <b>PAE Jiffy</b>
      {'\u2122'} uses the{' '}
      <Link
        href="https://igraph.org/r/html/1.3.0/cluster_leiden.html"
        target="_blank"
        rel="noopener noreferrer"
      >
        cluster_leiden()
      </Link>{' '}
      function from{' '}
      <Link
        href="https://igraph.org/"
        target="_blank"
        rel="noopener noreferrer"
      >
        igraph
      </Link>{' '}
      to find the community structure of a graph using the Leiden algorithm of{' '}
      <Link
        href="https://doi.org/10.1038/s41598-019-41695-z"
        target="_blank"
        rel="noopener noreferrer"
      >
        {' '}
        Traag, van Eck & Waltman
      </Link>
      .
    </Typography>
  </InstructionsAccordion>
)

export default PAEJiffyInstructions
