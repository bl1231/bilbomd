import formModel from './formModel'

const {
  formField: { pdb_file, const_inp_file }
} = formModel

const initialValues = {
  [pdb_file.name]: {
    file: null,
    src: null,
    name: '',
    chains: [
      {
        id: '',
        atoms: '',
        first_res: '',
        last_res: '',
        num_res: '',
        type: '',
        domains: [
          {
            start: '',
            end: ''
          }
        ]
      }
    ],
    rigid_bodies: [
      {
        id: '',
        domains: [
          {
            chainid: '',
            start: '',
            end: ''
          }
        ]
      }
    ]
  },
  // Optional: an existing constraints input file (const.inp, YAML or JSON) to
  // start the rigid bodies from; const_inp_file reads as "constraints input
  // file", whatever its format
  [const_inp_file.name]: {
    file: null,
    src: null,
    name: '',
    // True while the picked file is being read
    reading: false,
    // What the import found; null until the file has been read against the PDB
    notes: null as string[] | null
  }
}

export default initialValues
