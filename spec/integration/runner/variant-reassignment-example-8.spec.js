import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('change backup variant to valid variant', async () => {
    const reassignment = new VariantReassignment([], logger, {})
    await reassignment.execute([{
      productType: {
        id: product1.productType.id
      },
      key: 'sample-product1',
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: 'product',
        de: 'produkte'
      },
      masterVariant: {
        sku: '1',
        prices: []
      },
      variants: []
    }], [product1])

    const { body: { results } } = await ctpClient.productProjections
      .staged(true)
      .where('masterVariant(sku in ("1", "2"))')
      .where('variants(sku in ("1", "2"))')
      .whereOperator('or')
      .fetch()
    expect(results).to.have.lengthOf(2)
    const updatedProduct1 = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct1.variants).to.have.lengthOf(0)
    const updatedProduct2 = results.find(product => product.masterVariant.sku === '2')
    expect(updatedProduct2.variants).to.have.lengthOf(0)
  })
})
