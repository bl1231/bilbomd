import { Alert, AlertTitle } from '@mui/material'

interface ImportNotesProps {
  name: string
  notes: string[]
}

/**
 * What happened when an existing const.inp was read into the jiffy: a success
 * line when everything matched the PDB, otherwise each thing to check.
 */
const ImportNotes = ({ name, notes }: ImportNotesProps) =>
  notes.length === 0 ? (
    <Alert
      severity="success"
      sx={{ m: 1 }}
      data-testid="const-inp-import-notes"
    >
      Every body in <b>{name}</b> matches the PDB. Edit them in the next step.
    </Alert>
  ) : (
    <Alert
      severity="warning"
      sx={{ m: 1 }}
      data-testid="const-inp-import-notes"
    >
      <AlertTitle>
        Read <b>{name}</b>, with {notes.length}{' '}
        {notes.length === 1 ? 'thing' : 'things'} to check
      </AlertTitle>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
    </Alert>
  )

export default ImportNotes
