// Where a job page gets its data from: an owner (or Admin/Manager) viewing a
// job by its Mongo id, or anyone holding a public results token.
export type JobSource =
  { kind: 'owner'; id: string } | { kind: 'public'; token: string }

// Props for the components that already switch between the protected and
// public endpoints themselves (FoXSAnalysis, MolstarViewer).
export const sourceProps = (source: JobSource) =>
  source.kind === 'owner'
    ? { isPublic: false, publicId: undefined }
    : { isPublic: true, publicId: source.token }
