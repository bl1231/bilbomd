const formModel = {
  formId: 'formId',
  formField: {
    pdb_file: {
      name: 'pdb_file' as const,
      label: 'Please upload a PDB File',
      reviewLabel: 'Your PDB file is still here: ',
      requiredErrorMsg: 'PDB file is required',
      type: 'file',
      rigid_bodies: ''
    },
    const_inp_file: {
      name: 'const_inp_file' as const,
      label: 'Optionally, start from an existing const.inp file',
      type: 'file'
    },
    domains: {
      name: 'domains',
      label: 'Select some domains',
      type: 'text'
    }
  }
}
export default formModel
