import { apiSlice } from 'app/api/apiSlice'

// const initialState = paeVizAdapter.getInitialState()
export type ClusterType = 'rigid' | 'fixed'
export type VizCluster = {
  id: number
  type: ClusterType
  ranges: [number, number][] // 1-based inclusive residue ranges in flattened index space
  bbox?: [number, number, number, number]
}
export type VizJSON = {
  length: number
  downsample?: number
  mask?: { plddt_cutoff?: number; low_confidence_residues?: number[] }
  clusters: VizCluster[]
}

export const alphafoldPaeVizSlice = apiSlice.injectEndpoints({
  endpoints: (build) => ({
    getVizJson: build.query<VizJSON, string>({
      query: (uuid) => ({ url: `/af2pae/${uuid}/viz.json`, method: 'GET' }),
      providesTags: (_r, _e, uuid) => [
        { type: 'Af2PaeViz', id: `${uuid}:viz.json` }
      ]
    }),

    getPaeBin: build.query<ArrayBuffer, string>({
      query: (uuid) => ({
        url: `/af2pae/${uuid}/pae.bin`,
        method: 'GET',
        responseHandler: async (response) => await response.arrayBuffer()
      }),
      providesTags: (_r, _e, uuid) => [
        { type: 'Af2PaeViz', id: `${uuid}:pae.bin` }
      ]
    }),

    getVizPng: build.query<Blob, string>({
      query: (uuid) => ({
        url: `/af2pae/${uuid}/viz.png`,
        method: 'GET',
        responseHandler: async (response) => await response.blob()
      }),
      providesTags: (_r, _e, uuid) => [
        { type: 'Af2PaeViz', id: `${uuid}:viz.png` }
      ]
    }),

    getPaePng: build.query<Blob, string>({
      query: (uuid) => ({
        url: `/af2pae/${uuid}/pae.png`,
        method: 'GET',
        responseHandler: async (response) => await response.blob()
      }),
      providesTags: (_r, _e, uuid) => [
        { type: 'Af2PaeViz', id: `${uuid}:pae.png` }
      ]
    })
  }),
  overrideExisting: true
})

export const {
  useGetVizJsonQuery,
  useGetPaeBinQuery,
  useGetVizPngQuery,
  useGetPaePngQuery
} = alphafoldPaeVizSlice
