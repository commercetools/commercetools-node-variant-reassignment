import _ from 'lodash'
import errorToJson from 'utils-error-to-json'
import uuid from 'uuid/v1'

import { Logger } from 'sphere-node-utils'

export default (scope, logLevel) => {
  const logger = new Logger({
    name: scope,
    levelStream: process.env.LOG_LEVEL || logLevel || 'info',
  })

  logger.fields.uuid = uuid().substr(0, 13)
  logger.logError = function logError (error, customMsg = '', details = {}) {
    if (_.isString(error))
      return this.error(error)

    const msg = customMsg
    error = error instanceof Error ? errorToJson(error) : error
    return this.error(_.merge(details, { error }), msg)
  }

  return logger
}

