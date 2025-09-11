import { IAlphaFoldEntity } from '@bl1231/bilbomd-mongodb-schema'

interface IAlphaFoldBody {
  entities_json?: string
  entities?: IAlphaFoldEntity[]
  [key: string]: unknown
}

export function parseAlphaFoldEntities(body: IAlphaFoldBody): IAlphaFoldEntity[] {
  if (body.entities_json) {
    return JSON.parse(body.entities_json)
  } else if (Array.isArray(body.entities)) {
    return body.entities.map((entity: IAlphaFoldEntity) => ({
      ...entity,
      copies: parseInt(entity.copies as unknown as string, 10)
    }))
  } else {
    const raw = body as Record<string, string>
    const entityIndices = new Set<number>()
    for (const key of Object.keys(raw)) {
      const match = key.match(/^entities\[(\d+)]/)
      if (match) entityIndices.add(Number(match[1]))
    }

    return [...entityIndices].sort().map((index) => ({
      name: raw[`entities[${index}][name]`],
      sequence: raw[`entities[${index}][sequence]`],
      type: raw[`entities[${index}][type]`],
      copies: parseInt(raw[`entities[${index}][copies]`] || '1', 10)
    }))
  }
}
