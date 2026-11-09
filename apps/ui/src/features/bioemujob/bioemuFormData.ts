import type { NewOpenFoldJobFormValues } from 'types/openfoldForm'

// The multipart body POST /jobs/bilbomd-bioemu expects (same entity fields as
// the OpenFold3 form; the backend parses entities[i][...])
export const bioemuFormData = (values: NewOpenFoldJobFormValues): FormData => {
  const form = new FormData()
  form.append('title', values.title)
  form.append('dat_file', values.dat_file)
  form.append('q_units', values.q_units)
  form.append('bilbomd_mode', 'bioemu')
  values.entities.forEach((entity, index) => {
    form.append(`entities[${index}][id]`, entity.id)
    form.append(`entities[${index}][name]`, entity.name)
    form.append(`entities[${index}][sequence]`, entity.sequence)
    form.append(`entities[${index}][type]`, entity.type)
    form.append(`entities[${index}][copies]`, entity.copies.toString())
  })
  return form
}
