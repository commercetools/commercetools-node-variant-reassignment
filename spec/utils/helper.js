import Promise from 'bluebird'
import bunyan from 'bunyan'
import _ from 'lodash'
import path from 'path'
import * as sphere from '../../lib/services/sphere'
import Logger from '../../lib/services/logger'

const sampleProductType = require('../resources/productType.json')
const sampleProduct = require('../resources/product.json')

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
export function deleteResource (resource, predicate) {
  logger.debug(`Deleting Sphere resource ${resource._currentEndpoint}`
    + ` with predicate`, predicate)

  return resource
    .where(predicate || '')
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
export async function ensureResource (resource, item, conditionKey = 'key') {
  const res = await resource
    .perPage(1)
    .where(`${conditionKey} = "${item[conditionKey]}"`)
    .fetch()

  if (res.body.results.length)
    return res.body.results[0]

  const createRes = await resource.create(item)
  return createRes.body
}


/**
 * Will generate a product with variants based on given skus
 * @param sku products SKU
 * @param productTypeId ID of a productType
 */
export function generateProduct (skus, productTypeId) {
  skus = _.isArray(skus)
    ? _.cloneDeep(skus)
    : [skus]

  const product = _.cloneDeep(sampleProduct)
  const sku = skus.shift()
  product.productType.id = productTypeId
  product.masterVariant.sku = sku
  product.slug.en += sku
  product.name.en += sku
  product.key += sku


  for (const variantSku of skus) {
    const variant = _.cloneDeep(product.masterVariant)
    variant.sku = variantSku
    product.variants.push(variant)
  }
  return product
}

/**
 * Delete all resources used in tests
 */
export async function deleteResourcesAll (client, _logger) {
  const resourcesToDelete = [
    client.products,
    client.productDiscounts,
    client.inventoryEntries,
    client.productTypes,
    client.channels
  ]
  for (const resource of resourcesToDelete)
    await deleteResource(resource, '', _logger)
}

export function createLogger (filename) {
  return Logger(
    `Test::helper::${path.basename(filename)}`, process.env.LOG_LEVEL)
}

export function getProductsBySkus (skus, ctpClient) {
  return ctpClient.productProjections
    .staged(true)
    .where(`masterVariant(sku in ("${skus.join('","')}"))`)
    .where(`variants(sku in ("${skus.join('","')}"))`)
    .whereOperator('or')
    .fetch()
}
