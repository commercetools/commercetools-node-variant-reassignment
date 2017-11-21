import Promise from 'bluebird'
import bunyan from 'bunyan'
import * as sphere from '../../lib/services/sphere'

const sampleProductType = require('../resources/productType.json')

export const projectKey = process.env.TEST_PROJECT_KEY
  || 'ctp-node-variant-reassignment-tests'

// Basic usage.
export const logger = bunyan.createLogger({
  name: 'Test',
  level: 'debug'
})

/**
 * Will create a Sphere Client used for itegration tests
 * @param key Project key
 * @returns {Promise} SphereClient
 */
export function createClient (key) {
  logger.debug(`Using project key '${key || projectKey}'`)
  return sphere.getClient(logger, key || projectKey)
}

/**
 * Will delete all items in given resource
 * @param resource  Sphere client resource (eg. sphereClient.customObjects)
 * @param predicate Sphere predicate of items which should be deleted
 */
export function deleteResource (resource, predicate = '') {
  logger.debug(`Deleting Sphere resource ${resource._currentEndpoint}`
    + ` with predicate`, predicate)

  return resource
    .where(predicate)
    .perPage(500)
    .process(res =>
      Promise.map(res.body.results, item =>
        resource
          .byId(item.id)
          .delete(item.version)
      , { concurrency: 10 })
    , { accumulate: false })
}

/**
 * Will unpublish all products on API
 * @param client    API client
 */
export function unpublishAllProducts (client) {
  logger.debug(`Unpublishing all products`)

  return client.productProjections
    .where('published=true')
    .perPage(200)
    .process(res =>
      Promise.map(res.body.results, item =>
          client.products
            .byId(item.id)
            .update({
              version: item.version,
              actions: [{
                action: 'unpublish'
              }]
            })
        , { concurrency: 10 })
    , { accumulate: false })
}

/**
 * Delete all resources used in tests
 */
export function deleteResources (client) {
  return Promise.each([
    client.products,
    client.productTypes
  ], resource => deleteResource(resource))
}

export function ensureProductType (sphereClient) {
  return ensureResource(sphereClient.productTypes, sampleProductType, 'name')
}

/**
 * Will create multiple resources
 */
export function createResources (resource, items) {
  return Promise.map(
    items,
    item => createResource(resource, item),
    { concurrency: 2 }
  )
}

/**
 * Will create a resource on Sphere
 * @param resource Sphere client resource (eg. sphereClient.customObjects)
 * @param item Item which should be created
 */
export function createResource (resource, item) {
  return resource.create(item)
    .then(res => res.body)
}

/**
 * Will create a product on Sphere
 */
export function createProduct (sphereClient, product) {
  return createResource(sphereClient.products, product)
}

/**
 * Will ensure resources on Sphere
 * @param resource Sphere client resource (eg. sphereClient.customObjects)
 * @param item Item which should be created
 * @param conditionKey Object property nameused in predicate
 */
export function ensureResource (resource, item, conditionKey = 'key') {
  return resource
    .perPage(1)
    .where(`${conditionKey} = "${item[conditionKey]}"`)
    .fetch()
    .then((res) => {
      if (res.body.results.length)
        return res.body.results[0]

      return resource.create(item)
        .then(createRes => createRes.body)
    })
}
