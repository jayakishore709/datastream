import { createTransformStream } from '@datastream/core'
import { defaultOptions, formatArray, formatObject } from 'csv-rex/format'

export const csvFormatStream = (options, streamOptions) => {
  const csvOptions = { ...defaultOptions, ...options }
  csvOptions.escapeChar ??= csvOptions.quoteChar
  let format
  const transform = (chunk, enqueue) => {
    if (csvOptions.header === true) {
      csvOptions.header = Object.keys(chunk)
    }
    if (typeof format === 'undefined' && Array.isArray(csvOptions.header)) {
      enqueue(formatArray(csvOptions.header, csvOptions))
    }
    format ??= Array.isArray(chunk) ? formatArray : formatObject
    enqueue(format(chunk, csvOptions))
  }
  return createTransformStream(transform, streamOptions)
}
export default csvFormatStream