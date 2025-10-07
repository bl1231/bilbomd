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

    // NOTE: Redux state must be serializable. We convert ArrayBuffer/Blob responses
    // into serializable strings (Base64 for .bin and object URLs for .png) so
    // the RTK serializableCheck middleware does not warn.
    getPaeBin: build.query<string, string>({
      query: (uuid) => ({
        url: `/af2pae/${uuid}/pae.bin`,
        method: 'GET',
        responseHandler: async (response) => await response.arrayBuffer()
      }),
      transformResponse: (buffer: ArrayBuffer) => {
        const bytes = new Uint8Array(buffer)
        const chunkSize = 0x8000
        let binary = ''
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
        }
        return btoa(binary) // Base64-encoded string (serializable)
      },
      keepUnusedDataFor: 60,
      providesTags: (_r, _e, uuid) => [
        { type: 'Af2PaeViz', id: `${uuid}:pae.bin` }
      ]
    }),

    getVizPng: build.query<string, string>({
      query: (uuid) => ({
        url: `/af2pae/${uuid}/viz.png`,
        method: 'GET',
        responseHandler: async (response) => await response.blob()
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
      keepUnusedDataFor: 60,
      providesTags: (_r, _e, uuid) => [
        { type: 'Af2PaeViz', id: `${uuid}:viz.png` }
      ]
    }),

    getPaePng: build.query<string, string>({
      query: (uuid) => ({
        url: `/af2pae/${uuid}/pae.png`,
        method: 'GET',
        responseHandler: async (response) => await response.blob()
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
      keepUnusedDataFor: 60,
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
