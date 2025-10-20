// in src/interfaces/assetInterface.ts
export interface IMovieAsset {
  label: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  mp4?: string
  poster?: string
  thumb?: string
  source?: { pdb?: string; dcd?: string }
  meta?: {
    width?: number
    height?: number
    stride?: number
    fps?: number
    ray?: boolean
  }
  error?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface IAssets {
  movies: IMovieAsset[]
}
