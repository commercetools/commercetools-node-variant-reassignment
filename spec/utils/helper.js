import _ from 'lodash'
import path from 'path'
import Promise from 'bluebird'
import bunyan from 'bunyan'
import * as ctp from './ctp'

import Logger from '../../lib/services/logger'

const sampleProductType = require('../resources/productType.json')
const sampleProductProjection = require('../resources/productProjection.json')
const sampleProduct = require('../resources/product.json')

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

export async function deleteAllProducts (client) {
  logger.debug(`Deleting ctp products`)

  await unpublishAllProducts(client)
  return deleteResource(client.products)
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
 * @param skus products SKU
 * @param productTypeId ID of a productType
 */
export function generateProduct (skus, productTypeId) {
  skus = _.isArray(skus)
    ? _.cloneDeep(skus)
    : [skus]

  const product = _.cloneDeep(sampleProduct)
  const sku = skus.shift()
  product.productType.id = productTypeId
  for (const productData of [product.masterData.staged, product.masterData.current]) {
    productData.masterVariant.sku = sku
    productData.slug.en += sku
    productData.name.en += sku
  }
  product.key += sku

  for (const variantSku of skus) {
    const variant = _.cloneDeep(product.masterData.staged.masterVariant)
    variant.sku = variantSku
    product.masterData.staged.variants.push(variant)
  }
  return product
}

export function generateProductProjection (skus, productTypeId) {
  skus = _.isArray(skus)
    ? _.cloneDeep(skus)
    : [skus]

  const productProjection = _.cloneDeep(sampleProductProjection)
  const sku = skus.shift()
  productProjection.productType.id = productTypeId
  productProjection.masterVariant.sku = sku
  productProjection.slug.en += sku
  productProjection.name.en += sku
  productProjection.key += sku


  for (const variantSku of skus) {
    const variant = _.cloneDeep(productProjection.masterVariant)
    variant.sku = variantSku
    productProjection.variants.push(variant)
  }
  return productProjection
}

export async function createCtpProducts (skuGroups, ctpClient, beforeProductCreateCb) {
  const productType = await ensureProductType(ctpClient)
  const masterVariantSkus = []
  for (let i = 0; i < skuGroups.length; i++) {
    const skus = skuGroups[i]
    const productDraft = generateProductProjection(skus, productType.id)
    if (beforeProductCreateCb)
      beforeProductCreateCb(productDraft)
    const product = await ensureResource(ctpClient.products, productDraft)
    masterVariantSkus.push(product.masterData.current.masterVariant.sku)
  }
  const { body: { results } } = await getProductsBySkus(masterVariantSkus, ctpClient)
  return results
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
    client.channels,
    client.customObjects
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
