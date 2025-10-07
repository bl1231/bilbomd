import {
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Link,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

const ColorBox = ({ color }: { color: string }) => (
  <Box
    sx={{
      display: 'inline-block',
      width: 12,
      height: 12,
      backgroundColor: color,
      mr: 0.5
    }}
  />
)

const paeColors = [
  'rgb(68, 1, 84)', // purple
  'rgb(59, 82, 139)', // blue
  'rgb(33, 144, 141)', // greenish
  'rgb(94, 201, 98)', // yellow-green
  'rgb(253, 231, 37)' // yellow
]

const PAEMatrixPlotExplanation = () => {
  return (
    <Accordion defaultExpanded={true}>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
        sx={{
          backgroundColor: '#888',
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          pl: 1
        }}
      >
        <Typography
          sx={{
            textTransform: 'uppercase',
            fontSize: '0.875rem',
            fontWeight: 400,
            color: '#fff',
            letterSpacing: '1px'
          }}
        >
          Interpreting the PAE Matrix
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ ml: 3 }}>
          <Typography
            variant="h4"
            gutterBottom
          >
            Interpreting the PAE Matrix
          </Typography>

          <Typography variant="body1">
            The PAE matrix is a key output of AlphaFold, providing insights into
            the predicted alignment errors between residues. If you would like a
            more detailed explanation of the PAE matrix please have a look at
            these{' '}
            <Link
              href="https://www.ebi.ac.uk/training/online/courses/alphafold/inputs-and-outputs/evaluating-alphafolds-predicted-structures-using-confidence-scores/pae-a-measure-of-global-confidence-in-alphafold-predictions/"
              target="_blank"
              rel="noopener noreferrer"
            >
              tutorial materials
            </Link>{' '}
            developed as part of EMBL-EBI Training on AlphaFold.
          </Typography>

          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 1 }}
          >
            PAE Basics
          </Typography>
          <Typography variant="body1">
            A Predicted Aligned Error (PAE) matrix comes from AlphaFold.
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Size: L × L (where L = number of residues)." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Entry (i, j) = expected positional error (in Å) at residue i if the predicted structure were aligned on residue j." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Diagonal = trivial (aligning a residue to itself → error near 0)." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Off-diagonal = how well two residues are predicted to be positioned relative to each other." />
            </ListItem>
          </List>

          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 2 }}
          >
            Diagonal vs. Off-Diagonal Blocks
          </Typography>
          <Typography variant="body1">
            <strong>Diagonal blocks:</strong> within a single domain or chain
            region.
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText
                primary={
                  <>
                    Dark/low <ColorBox color={paeColors[0]} />
                    <ColorBox color={paeColors[1]} /> PAE values = residues are
                    predicted confidently relative to each other (domain is
                    rigid).
                  </>
                }
              />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText
                primary={
                  <>
                    Bright/high <ColorBox color={paeColors[3]} />
                    <ColorBox color={paeColors[4]} />
                    PAE values = local disorder or flexible loops.
                  </>
                }
              />
            </ListItem>
          </List>
          <Typography variant="body1">
            <strong>Off-diagonal blocks:</strong> between different domains or
            chains.
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText
                primary={
                  <>
                    Low values <ColorBox color={paeColors[0]} />
                    <ColorBox color={paeColors[1]} /> → the model is confident
                    about their relative orientation (AlphaFold “thinks” they
                    pack together in a fixed way).
                  </>
                }
              />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              {/* <ListItemText primary="High values → AlphaFold is uncertain about how those domains/chains are arranged relative to one another; they might float or hinge." /> */}
              <ListItemText
                primary={
                  <>
                    High values <ColorBox color={paeColors[3]} />
                    <ColorBox color={paeColors[4]} /> → AlphaFold is uncertain
                    about how those domains/chains are arranged relative to one
                    another; they might float or hinge.
                  </>
                }
              />
            </ListItem>
          </List>

          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 2 }}
          >
            How to Read the Patterns
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Symmetry: the matrix is symmetric, so info in (i,j) = (j,i)." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Sharp boundaries: rectangular low-PAE regions off the diagonal often indicate domain–domain contacts (the model predicts a rigid relationship)." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Diffuse or bright off-diagonal areas: the relative placement of those regions is ambiguous → multiple conformations are plausible." />
            </ListItem>
          </List>

          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 2 }}
          >
            Practical Implications
          </Typography>
          <Typography variant="body1">
            <strong>Single-chain, multi-domain proteins:</strong> off-diagonal
            tells you whether AlphaFold is confident about domain packing.
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Example: If chain A residues 1–200 vs. residues 300–500 have high PAE off-diagonal, it means AlphaFold predicted each domain confidently but isn't sure how they orient relative to one another." />
            </ListItem>
          </List>
          <Typography variant="body1">
            <strong>Multimer predictions:</strong> off-diagonal between chains
            tells you if the relative placement of chains is trustworthy.
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Low off-diagonal → confident quaternary arrangement." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="High off-diagonal → AlphaFold couldn't resolve how chains interact (may suggest weak/no interaction or multiple assemblies)." />
            </ListItem>
          </List>

          <Typography
            variant="h5"
            gutterBottom
            sx={{ mt: 2 }}
          >
            TL;DR
          </Typography>
          <List
            sx={{
              listStyleType: 'disc',
              pl: 2,
              '& .MuiListItem-root': { display: 'list-item' }
            }}
          >
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Diagonal blocks = internal confidence of a domain." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Off-diagonal blocks = relative confidence between domains/chains." />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Dark off-diagonal = “rigidly locked together.”" />
            </ListItem>
            <ListItem sx={{ py: 0 }}>
              <ListItemText primary="Bright off-diagonal = “could flop around / multiple orientations.”" />
            </ListItem>
          </List>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

export default PAEMatrixPlotExplanation
