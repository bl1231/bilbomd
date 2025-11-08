import {
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Link
} from '@mui/material'
import useTitle from 'hooks/useTitle'
import Introduction from '../shared/Introduction'
import AdditionalInfo from '../shared/AdditionalInfo'
import { Grid } from '@mui/system'
import { grey } from '@mui/material/colors'

const Help = ({ title = 'BilboMD: Help' }) => {
  useTitle(title)

  const content = (
    <Box>
      <Grid
        container
        spacing={2}
      >
        <Introduction title="BilboMD Help">
          <b>BilboMD</b> allows you to determine the three-dimensional domain
          structure of proteins based on conformational sampling using a
          Molecular Dynamics (MD) approach. Conformational sampling performed by{' '}
          <Link
            href="https://academiccharmm.org/documentation"
            target="_blank"
            rel="noopener noreferrer"
          >
            CHARMM
          </Link>{' '}
          is followed by structure validation using{' '}
          <Link
            href="https://modbase.compbio.ucsf.edu/foxs/about"
            target="_blank"
            rel="noopener noreferrer"
          >
            FoXS
          </Link>{' '}
          and ensemble analysis using Minimal Ensemble Search (MES) via{' '}
          <Link
            href="https://modbase.compbio.ucsf.edu/multifoxs/"
            target="_blank"
            rel="noopener noreferrer"
          >
            MultiFoXS
          </Link>
          .Details of the implementation and integration of these tools into{' '}
          <b>BilboMD</b> are described in the following manuscript:
          <Typography
            variant="body2"
            sx={{ mx: 5, my: 2 }}
          >
            Pelikan M, Hura GL, Hammel M.{' '}
            <b>
              Structure and flexibility within proteins as identified through
              small angle X-ray scattering.
            </b>{' '}
            Gen Physiol Biophys. 2009 Jun;28(2):174-89. doi:
            10.4149/gpb_2009_02_174. PMID:{' '}
            <Link
              href="https://pubmed.ncbi.nlm.nih.gov/19592714/"
              target="_blank"
              rel="noopener noreferrer"
            >
              19592714
            </Link>
            ; PMCID: PMC3773563.
          </Typography>
        </Introduction>

        <Box sx={{ m: 1, p: 0 }}>
          <Typography
            variant="h4"
            gutterBottom
          >
            BilboMD Web Server – Help &amp; Documentation
          </Typography>

          <Typography variant="body1">
            BilboMD is a web server for modeling flexible macromolecules against
            small-angle X-ray scattering (SAXS) data using coarse-grained
            molecular dynamics. It allows you to define rigid and flexible
            regions, explore conformational ensembles, and select models or
            ensembles that best fit the experimental scattering curve.
          </Typography>

          {/* Overview / Workflows */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 3 }}
          >
            BilboMD Pipelines
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
            <Box sx={{ flex: 1 }}>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="BilboMD Classic (PDB / CRD)"
                    secondary="Start from an initial atomic model (PDB or CRD/PSF), define rigid and flexible segments, and run coarse-grained MD guided by user-defined restraints (e.g., radius of gyration)."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="BilboMD Auto"
                    secondary="Provide a starting molecular model and PAE matrix from Alphafold2/3. The rigid and flexible regions will be defined from the APE matrix automatically, and you can proceed to run MD simulations as in the classic pipeline."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="BilboMD AF (Alphafold)"
                    secondary="This pipeline runs Alphafold2 on your input sequence. The Alphafold models are used as starting structures and refine flexible regions to better match SAXS data."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Additional tools"
                    secondary="Jiffy tools for AF2 PAE inspection, SANS-related workflows, and other utilities may be available under the dashboard as needed."
                  />
                </ListItem>
              </List>
            </Box>
            <Box
              sx={{
                flex: 1,
                minWidth: 200,
                minHeight: 200,
                backgroundColor: grey[300],
                ml: 2
              }}
            >
              {/* Placeholder for figure */}
            </Box>
          </Box>

          {/* Access / Modes */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 3 }}
          >
            Access Modes: Anonymous vs Authenticated
          </Typography>
          <Typography variant="body1">
            BilboMD can be used in two ways:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="Anonymous access"
                secondary="Submit jobs without logging in. You will receive a public job ID and a permalink you can bookmark to monitor progress and download results. This mode is suitable for quick tests and simple jobs."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Authenticated access"
                secondary="Register or sign in (e.g., via email or ORCID) to manage your jobs over time, organize multiple projects, and use API-based access. Authenticated jobs are private to you."
              />
            </ListItem>
          </List>

          <Typography
            variant="body2"
            sx={{ mt: 1 }}
          >
            BilboMD is provided free of charge for academic and non-commercial
            use. No login is required for basic usage or submitting anonymous
            jobs.
          </Typography>

          {/* Step-by-step: sample job */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 4 }}
          >
            Running a Job with Sample Data
          </Typography>

          <Typography
            variant="body1"
            sx={{ mb: 2 }}
          >
            The easiest way to get started is to use the built-in sample data
            from the anonymous interface. This allows you to run a complete
            BilboMD workflow without preparing your own files.
          </Typography>

          <Typography
            variant="subtitle1"
            gutterBottom
          >
            Quick Start: Classic BilboMD Job (Sample Data)
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="1. Open the anonymous classic job form."
                secondary="Navigate to the “Classic BilboMD” page (e.g., “Classic Job (anonymous)” in the header). This displays the web form for submitting a BilboMD job."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="2. Load sample data."
                secondary="Click the “Load sample data” or “Use example input” button. This will populate the form with a sample PDB structure and a matching SAXS curve, plus reasonable default parameters."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="3. Review key parameters."
                secondary="Check the rigid and flexible regions, number of ensembles, and any restraints such as target radius of gyration (Rg). For first use, the defaults are usually fine."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="4. Submit the job."
                secondary="Click “Submit” to send the job. You will be shown a public job ID and a permalink to the results page. Keep this link to monitor progress and return later."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="5. Monitor status."
                secondary="On the results page, the job status will progress from “Submitted” to “Running” to “Completed.” You can refresh the page periodically to see updated status and output."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="6. Inspect output and download results."
                secondary="Once completed, you can view model ensembles, SAXS fit plots, and download a results tarball containing all output files."
              />
            </ListItem>
          </List>

          {/* Interpreting the output */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 4 }}
          >
            Interpreting the Output
          </Typography>

          <Typography
            variant="subtitle1"
            gutterBottom
          >
            Results Overview
          </Typography>
          <Typography variant="body1">
            After a successful run, the results page displays:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="Job status and summary"
                secondary="Final status (Completed / Error), job type, MD engine, number of ensembles, and timestamps for submission, start, and completion."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Ensemble PDB files"
                secondary="Files such as “ensemble_size_1_model.pdb”, “ensemble_size_2_model.pdb”, etc., each containing a set of models representing increasing flexibility and/or number of conformers."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Molecular visualization"
                secondary="An interactive Mol* viewer is embedded for direct visualization of ensemble models. You can rotate, zoom, and inspect individual models within an ensemble."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="SAXS fit and χ²"
                secondary="Plots comparing experimental SAXS data with calculated scattering from candidate models or ensembles, along with χ² or related goodness-of-fit metrics."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Radius of gyration and distributions"
                secondary="Rg values and distributions may be shown to summarize overall compaction/extension across the ensemble."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Downloadable archive"
                secondary="A “results.tar.gz” archive is available for download, containing all input copies, generated models, logs, and analysis files (e.g., ensemble PDB files and computed scattering curves)."
              />
            </ListItem>
          </List>

          <Typography
            variant="subtitle1"
            gutterBottom
            sx={{ mt: 2 }}
          >
            How to Use These Results
          </Typography>
          <Typography variant="body1">
            In a typical analysis, you will:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="Compare ensembles of different sizes."
                secondary="Smaller ensembles (e.g., one or two models) may already describe the data well, while larger ensembles may capture additional flexibility. Consider both the fit quality and physical interpretability."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Inspect flexible regions."
                secondary="Use the molecular viewer to focus on flexible linkers or domains and see how they rearrange across the ensemble."
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Relate χ² to structural hypotheses."
                secondary="Better fits (lower χ²) suggest that the ensemble is consistent with the SAXS data, but model quality should always be interpreted in the context of experimental uncertainty and prior structural knowledge."
              />
            </ListItem>
          </List>

          {/* Example / demo links (you can replace URLs with real ones) */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 4 }}
          >
            Example Output and Demo Jobs
          </Typography>
          <Typography
            variant="body1"
            sx={{ mb: 2 }}
          >
            You can explore example BilboMD output by running the built-in
            sample job, or by visiting public demo result pages provided in the
            manuscript or on the BilboMD website.
          </Typography>

          {/* Access / license statement */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 4 }}
          >
            Access and Licensing
          </Typography>
          <Typography
            variant="body1"
            sx={{ mb: 2 }}
          >
            BilboMD is freely accessible for academic and non-commercial use.
            Basic functionality, including anonymous job submission and
            retrieval of results, does not require registration. Optional user
            accounts (e.g., via ORCID or email) are provided to support
            long-term job management and API-based access.
          </Typography>
          <Typography variant="body1">
            For more information about how data and cookies are handled, please
            see our <Link href="/privacy">Privacy and Cookie Policy</Link>.
          </Typography>
        </Box>
        {/* Additional Information */}
        <AdditionalInfo />
      </Grid>
    </Box>
  )

  return content
}

export default Help
