import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/* eslint-enable max-len */
describe('Variant reassignment - do not anonymize slugs when not necessary', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let productBefore
  const productMasterVariantSku = 'red-bike'
  const productVariantSku = 'green-bike'

  before(async () => {
    ctpClient = await utils.createClient()

    const results = await utils.createCtpProducts([[productMasterVariantSku, productVariantSku]],
      ctpClient, (pD) => {
        pD.slug = { en: 'bike' }
        return pD
      })
    productBefore = results[0]
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('should remove variant from new draft and update slug of the new product', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger, undefined, ['brandId'])
    const productDraft = {
      productType: {
        id: productBefore.productType.id
      },
      name: { en: 'red-bike-name' },
      slug: { en: 'red-bike-slug' },
      masterVariant: productBefore.variants[0]
    }
    const { statistics } = await reassignment.execute([productDraft])

    utils.expectStatistics(statistics, 0, 0, 1, 1)
    const { body: { results } } = await utils.getProductsBySkus(
      [productMasterVariantSku, productVariantSku], ctpClient
    )
    expect(results).to.have.lengthOf(2)
    const productFromDraft = results.find(product =>
      product.masterVariant.sku === productDraft.masterVariant.sku)
    expect(productFromDraft.id).to.equal(productBefore.id)
    for (const productAfter of results)
      expect(productAfter.slug).to.not.have.any.keys('ctsd')
  })
})
