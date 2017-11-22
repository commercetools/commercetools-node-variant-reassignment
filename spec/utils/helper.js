import _ from 'lodash'
import Promise from 'bluebird'
import bunyan from 'bunyan'
import * as ctp from '../../lib/services/ctp'

const sampleProductType = require('../resources/productType.json')

export const projectKey = process.env.TEST_PROJECT_KEY
  || 'ctp-node-variant-reassignment-tests'

// Basic usage.
export const logger = bunyan.createLogger({
  name: 'Test',
  level: 'debug'
})

/**
 * Will create a ctp client used for itegration tests
 * @param key Project key
 * @returns {Promise} ctpClient
 */
export function createClient (key) {
  logger.debug(`Using project key '${key || projectKey}'`)
  return ctp.getClient(logger, key || projectKey)
}

/**
 * Will delete all items in given resource
 * @param resource  ctp client resource (eg. ctpClient.customObjects)
 * @param predicate ctp predicate of items which should be deleted
 */
export function deleteResource (resource, predicate = '') {
  logger.debug(`Deleting ctp resource ${resource._currentEndpoint}`
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
export async function deleteResources (client) {
  await deleteResource(client.products)
  await deleteResource(client.productTypes)
}

export function ensureProductType (ctpClient, productType = sampleProductType) {
  productType = _.cloneDeep(productType)
  return ensureResource(ctpClient.productTypes, productType, 'name')
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
 * Will create a resource on ctp
 * @param resource ctp client resource (eg. ctpClient.customObjects)
 * @param item Item which should be created
 */
export function createResource (resource, item) {
  return resource.create(item)
    .then(res => res.body)
}

/**
 * Will create a product on ctp
 */
export function createProduct (ctpClient, product) {
  return createResource(ctpClient.products, product)
}

/**
 * Will ensure resources on ctp
 * @param resource ctp client resource (eg. ctpClient.customObjects)
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
