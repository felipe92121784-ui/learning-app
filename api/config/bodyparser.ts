import { defineConfig } from '@adonisjs/core/bodyparser'
import { chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const ONE_GIBIBYTE = 1024 * 1024 * 1024
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024
export const multipartTmpDirectory = join(tmpdir(), 'ideal-learning-materials')

export function privateMultipartFileName() {
  mkdirSync(multipartTmpDirectory, { recursive: true, mode: 0o700 })
  chmodSync(multipartTmpDirectory, 0o700)
  return join(multipartTmpDirectory, randomUUID())
}

const bodyParserConfig = defineConfig({
  /**
   * Parse request bodies for these HTTP methods.
   * Keep this aligned with methods that receive payloads in your routes.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser.
   */
  form: {
    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the form parser.
     */
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser.
   */
  json: {
    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the JSON parser.
     */
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    /**
     * Multipart files are processed explicitly by the authorized material
     * upload middleware.
     */
    autoProcess: false,

    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Routes where multipart processing is handled manually.
     */
    processManually: [],

    /**
     * Maximum accepted payload size for multipart requests.
     */
    limit: ONE_GIBIBYTE + MULTIPART_OVERHEAD_BYTES,

    /**
     * Store uploaded files beneath a private directory. The authorized
     * processing middleware applies mode 0600 before the controller runs.
     */
    tmpFileName: privateMultipartFileName,

    /**
     * Content types handled by the multipart parser.
     */
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
