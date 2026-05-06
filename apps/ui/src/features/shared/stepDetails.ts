interface StepDetails {
  friendlyName: string
  tooltipMessage: string
}

const getStepDetails = (stepName: string): StepDetails => {
  switch (stepName) {
    case 'nersc_prepare_slurm_batch':
      return {
        friendlyName: 'NERSC Prepare Slurm Batch File',
        tooltipMessage:
          'In this step we prepare the Slurm batch file for NERSC.'
      }
    case 'nersc_submit_slurm_batch':
      return {
        friendlyName: 'NERSC Submit Slurm Batch File',
        tooltipMessage:
          'In this step we submit the Slurm batch file to NERSC.'
      }
    case 'nersc_job_status':
      return {
        friendlyName: 'NERSC Job Status',
        tooltipMessage: 'This Chip will display the status of the NERSC job.'
      }
    case 'scoper':
      return {
        friendlyName: 'Scoper',
        tooltipMessage: 'In this step we run Scoper. Details are below.'
      }
    case 'reduce':
      return {
        friendlyName: 'Reduce',
        tooltipMessage:
          'In this step Hydrogen atoms are added to your RNA molecule.'
      }
    case 'rnaview':
      return {
        friendlyName: 'RNAView',
        tooltipMessage:
          'RNAView identifies base pairs that are formed in nucleic acid structures and classifies them according to the system of Leontis and Westhof'
      }
    case 'kgs':
      return {
        friendlyName: 'KGS',
        tooltipMessage:
          'KGS (Kino-Geometric Sampling) is an engine that generates conformational perturbations in biomolecules (protein, RNA, or ligands alike) by maintaining user-specified non-local constraints. '
      }
    case 'ionnet':
      return {
        friendlyName: 'IonNet',
        tooltipMessage:
          'IonNet is a deep learning model that predicts the locations of divalent cation binding sites on RNA structures.'
      }
    case 'alphafold':
      return {
        friendlyName: 'AlphaFold2',
        tooltipMessage:
          'In this step we use ColabFold to run AlphaFold on your molecule.'
      }
    case 'openfold':
      return {
        friendlyName: 'OpenFold3',
        tooltipMessage:
          'In this step we use OpenFold3 to predict the structure of your molecule.'
      }
    case 'pae':
      return {
        friendlyName: 'Define MD Domains from PAE/PDE Matrix',
        tooltipMessage:
          'In this step the PAE/PDE matrix from the structure prediction is used to define rigid bodies and rigid domains of your molecule.'
      }
    case 'autorg':
      return {
        friendlyName: 'AutoRg',
        tooltipMessage:
          'In this step we determine the Radius of gyration for your SAXS data.'
      }
    case 'pdb2crd':
      return { friendlyName: 'Convert PDB to CRD', tooltipMessage: '' }
    case 'minimize':
      return {
        friendlyName: 'Minimize',
        tooltipMessage: 'In this step we minimize the relax the initial model.'
      }
    case 'initfoxs':
      return { friendlyName: 'Initial FoXS', tooltipMessage: '' }
    case 'heat':
      return {
        friendlyName: 'Heating',
        tooltipMessage:
          'In this step we heat the starting model in preparation for MD.'
      }
    case 'md':
      return {
        friendlyName: 'Molecular Dynamics',
        tooltipMessage:
          'In this step we run molecular dynamics to generate possible model conformations.'
      }
    case 'dcd2pdb':
      return {
        friendlyName: 'Extract PDBs from MD Trajectories',
        tooltipMessage: ''
      }
    case 'pdb_remediate':
      return {
        friendlyName: 'Remediate PDB Files',
        tooltipMessage:
          'In this step we attempt to copy SEGID back to CHAINID'
      }
    case 'foxs':
      return {
        friendlyName: 'FoXS Analysis',
        tooltipMessage:
          'In this step we use FoXS to calculate SAXS scattering curves from MD models.'
      }
    case 'pepsisans':
      return {
        friendlyName: 'Pepsi-SANS Analysis',
        tooltipMessage:
          'In this step we use Pepsi-SANS to calculate SANS scattering curves from MD models.'
      }
    case 'multifoxs':
      return {
        friendlyName: 'MultiFoXS',
        tooltipMessage:
          'In this step we use MultiFoXS to determine the best FoXS curves to match your experimental SAXS data.'
      }
    case 'gasans':
      return {
        friendlyName: 'GA-SANS',
        tooltipMessage:
          'In this step we use a Genetic Algorithm to determine the best Pepsi-SANS curves to match your experimental SANS data.'
      }
    case 'copy_results_to_cfs':
      return {
        friendlyName: 'Copy Results to CFS',
        tooltipMessage:
          'In this step we copy the results from the PSCRATCH file system to the CFS file system.'
      }
    case 'nersc_copy_results_to_cfs':
      return {
        friendlyName: 'NERSC Copy Results to CFS',
        tooltipMessage:
          'In this step we copy the results from the PSCRATCH file system to the CFS file system.'
      }
    case 'results':
      return {
        friendlyName: 'Create Results file for download',
        tooltipMessage:
          'In this step we are gathering the results together and creating a file for you to download.'
      }
    case 'email':
      return {
        friendlyName: 'Send Email',
        tooltipMessage:
          'n this step we send an email to let you know the BilboMD job is complete.'
      }
    default:
      return { friendlyName: stepName, tooltipMessage: '' }
  }
}

export { getStepDetails }
export type { StepDetails }
