import { ProjectCredentialsConfig } from 'sphere-node-utils'
import { SphereClient } from 'sphere-node-sdk'

/**
 * Try to load credentials from pre-defined locations,
 * based on the `projectKey`
 *
 * @param {string} projectKey
 *
 * Lookup priority:
 * - ./.sphere-project-credentials
 * - ./.sphere-project-credentials.json
 * - ~/.sphere-project-credentials
 * - ~/.sphere-project-credentials.json
 * - /etc/sphere-project-credentials
 * - /etc/sphere-project-credentials.json
 * Otherwise look up from OS env
 * - SPHERE_PROJECT_KEY="your-project-key"
 * - SPHERE_CLIENT_ID="your-client-id"
 * - SPHERE_CLIENT_SECRET="your-client-secret"
 */
export function loadCredentials (logger, projectKey) {
  return ProjectCredentialsConfig.create()
    .then(config =>
      config.forProjectKey(projectKey)
    )
    .catch((err) => {
      logger.debug(err.toString(),
        'Unable to load credentials from config file.')
      return Promise.reject(err)
    })
}

/**
 * Will create ctp client
 * @param credentials JSON object with configuration
 */
export function createClient (credentials) {
  return new SphereClient({ config: credentials })
}

/**
 * Will load credentials and return ctp client
 * @param logger
 * @param projectKey
 * @returns {Promise}
 */
export function getClient (logger, projectKey) {
  return loadCredentials(logger, projectKey)
    .then(createClient)
}
