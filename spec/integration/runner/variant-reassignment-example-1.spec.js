import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +---------------------------+---------------------------------------------+--------------------+---------------------------------------------+
 * | New product draft         | CTP product                                 | After reassignment | CTP product                                 |
 * +---------------------------+---------------------------------------------+                    +---------------------------------------------+
 * | Product:                  | Product:                                    |                    | Product:                                    |
 * | slug: { en: "product-1" } | id: "1"                                     |                    | id: "1"                                     |
 * | product-type: "pt1"       | slug: { en: "product-1", de: "produkte-1" } |                    | slug: { en: "product-1", de: "produkte-1" } |
 * | variants: v1, v3          | product-type: "pt1"                         |                    | product-type: "pt1"                         |
 * |                           | variants: v1                                |                    | variants: v1, v3                            |
 * +---------------------------+---------------------------------------------+                    +---------------------------------------------+
 * |                           | Product:                                    |                    | Product:                                    |
 * |                           | id: "2"                                     |                    | id: "2"                                     |
 * |                           | slug: { en: "product-2" }                   |                    | slug: { en: "product-2" }                   |
 * |                           | product-type: "pt1"                         |                    | product-type: "pt1"                         |
 * |                           | variants: v3, v4                            |                    | variants: v4                                |
 * +---------------------------+---------------------------------------------+--------------------+---------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  let ctpClient
  let product1
  let product2
  const logger = utils.createLogger(__filename)

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)
    const productDraft2 = utils.generateProduct(['3', '4'], productType.id)
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('move variant v3 to another product', async () => {
    const reassignment = new VariantReassignment([], logger, {})
    const productDraft = {
      productType: {
        id: product1.productType.id
      },
      key: 'sample-product1',
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: 'sample-product1'
      },
      masterVariant: {
        sku: '1',
        prices: []
      },
      variants: [
        {
          sku: '3',
          prices: []
        }
      ]
    }
    await reassignment.execute([productDraft], [product1, product2])
    const { body: { results } } = await ctpClient.productProjections
      .staged(true)
      .where('masterVariant(sku in ("1", "3", "4"))')
      .where('variants(sku in ("1", "3", "4"))')
      .whereOperator('or')
      .fetch()
    expect(results).to.have.lengthOf(2)
    const backupProduct = results.find(product => product.masterVariant.sku === '4')
    expect(backupProduct).to.be.an('object')
    expect(backupProduct.variants).to.have.lengthOf(0)
    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct.variants[0].sku).to.equal(productDraft.variants[0].sku)
  })
})
