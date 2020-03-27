import { expect } from 'chai'
import { find } from 'lodash'

import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 * | Product draft                      | CTP product                          | After reassignment | CTP product                                                |
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 * | Product:                           | Product:                             |                    | Product id1 only with masterVariant sku1                   |
 * | slug: { en: "test1" }              | id: 1                                |    Reassignment    | New anonymized product with sku2, sku3                     |
 * | masterVariant: { sku: "sku1" }     | slug: { en: "test1" }                |        #1          |                                                            |
 * |                                    | masterVariant: { sku: "sku1" }       |                    |                                                            |
 * |                                    | variant SKUs: ['sku2', 'sku3']       |                    |                                                            |
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 * |                                    |                                      |                    | Product id1 only with masterVariant sku1                   |
 * |                                    |                                      |    Reassignment    | New product with sku2                                      |
 * |                                    |                                      |        #2          | Anonymized product with sku3 and only one anonymization id |
 * |                                    |                                      |                    |                                                            |
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment - product anonymization', () => {
  let ctpClient
  let product
  const logger = utils.createLogger(__filename)
  const variantSkus = ['sku1', 'sku2', 'sku3']

  before(async () => {
    ctpClient = await utils.createClient();
    [product] = await utils.createCtpProducts([variantSkus], ctpClient, (pD) => {
      pD.slug = { en: 'test1' }
    })
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('only one anonymization id when removing multiple variants one by one', async () => {
    // Reassignment #1
    const reassignment = new VariantReassignment(ctpClient, logger)
    const { statistics: stats1 } = await reassignment.execute([{
      productType: {
        id: product.productType.id
      },
      name: product.name,
      slug: product.slug,
      masterVariant: product.masterVariant
    }])

    utils.expectStatistics(stats1, 1, 0, 1, 1)
    expect(stats1.processedSkus).to.be.an('array')
    expect(stats1.processedSkus[0]).to.equal('sku1')

    // Reassignment #1 result
    const { body: { results } } = await utils.getProductsBySkus(variantSkus, ctpClient)
    expect(results).to.have.lengthOf(2)

    const originalProduct = find(results, ['masterVariant.sku', 'sku1'])
    const anonymizedProduct = find(results, ['masterVariant.sku', 'sku2'])

    expect(originalProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.an('undefined')
    expect(originalProduct.variants).to.have.length(0)

    const reassignment1AnonymizationId = anonymizedProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]

    expect(reassignment1AnonymizationId).to.be.a('string')
    expect(anonymizedProduct.variants).to.have.length(1)
    expect(anonymizedProduct.masterVariant.sku).to.equal('sku2')
    expect(anonymizedProduct.variants[0].sku).to.equal('sku3')
    expect(anonymizedProduct.slug.en).to.contain(reassignment1AnonymizationId)


    // Reassignment #2
    const reassignment2 = new VariantReassignment(ctpClient, logger)
    const productDraft2 = {
      productType: {
        id: product.productType.id
      },
      name: { en: `${product.name.en}-1` },
      slug: { en: `${product.slug.en}-1` },
      masterVariant: { sku: anonymizedProduct.masterVariant.sku }
    }
    const { statistics: stats2 } = await reassignment2.execute([productDraft2])

    utils.expectStatistics(stats1, 1, 0, 1, 1)
    expect(stats2.processedSkus).to.be.an('array')
    expect(stats2.processedSkus[0]).to.equal('sku2')

    // Reassignment #2 result
    const { body: { results: results2 } } = await utils.getProductsBySkus(variantSkus, ctpClient)
    expect(results2).to.have.lengthOf(3)

    const originalProduct2 = find(results2, ['masterVariant.sku', 'sku1'])
    const updatedProduct = find(results2, ['masterVariant.sku', 'sku2'])
    const anonymizedProduct2 = find(results2, ['masterVariant.sku', 'sku3'])

    // original product should not be changed by second reassignment
    expect(originalProduct2.version).to.equal(originalProduct.version)

    // updated product should have only one variant now
    expect(updatedProduct.variants).to.have.length(0)
    // slug should not be changed - it should be done later by product importer
    expect(updatedProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.equal(undefined)
    expect(updatedProduct.slug.en).to.equal(productDraft2.slug.en)

    // new anonymized product should have only one variant
    expect(anonymizedProduct2.variants).to.have.length(0)
    // should take slugs from the previous anonymized slug
    expect(anonymizedProduct2.slug).to.deep.equal(anonymizedProduct.slug)
  })
})
