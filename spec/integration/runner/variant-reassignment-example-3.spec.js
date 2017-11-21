import { expect } from 'chai'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import * as utils from '../../utils/helper'

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2', '3'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('remove variants v2 and v3 from product 1', async () => {
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
        en: 'sample-product1'
      },
      masterVariant: {
        sku: '1',
        prices: []
      },
      variants: []
    }], [product1])
    const { body: { results } } = await ctpClient.productProjections
      .staged(true)
      .where('masterVariant(sku in ("1", "2", "3"))')
      .where('variants(sku in ("1", "2", "3"))')
      .whereOperator('or')
      .fetch()
    expect(results).to.have.lengthOf(2)
    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct).to.be.an('object')
    expect(updatedProduct.variants).to.have.lengthOf(0)

    const newProduct = results.find(product => product.masterVariant.sku !== '1')
    expect(newProduct.variants).to.have.lengthOf(1)
    expect(newProduct.slug._ctsd).to.be.a('string')
  })
})
