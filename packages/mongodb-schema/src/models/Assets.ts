import { Schema } from 'mongoose'

// ──────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────
const assetStatusEnum = ['queued', 'running', 'ready', 'failed'] as const

// ──────────────────────────────────────────────
// Movie asset schema
// ──────────────────────────────────────────────
export const movieAssetSchema = new Schema({
  label: { type: String, required: true }, // e.g., "rg_27"
  status: { type: String, enum: assetStatusEnum, default: 'queued' },

  mp4: String,
  webm: String,
  poster: String,
  thumb: String,

  source: {
    pdb: String,
    dcd: String
  },

  meta: {
    width: Number,
    height: Number,
    fps: Number,
    duration_s: Number,
    frames_rendered: Number,
    stride: Number,
    crf: Number,
    ray: Boolean,
    supersample: Number,
    size_bytes: Number,
    generator: {
      version: String,
      tool: { type: String, default: 'pymol+ffmpeg' }
    }
  },

  attempts: { type: Number, default: 0 },
  error: String,
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
})

// ──────────────────────────────────────────────
// Assets container schema (room to grow later)
// ──────────────────────────────────────────────
export const assetsSchema = new Schema(
  {
    movies: { type: [movieAssetSchema], default: [] }
  },
  { _id: false }
)
