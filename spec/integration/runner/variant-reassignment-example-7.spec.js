import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    productDraft1.slug.en = 'product'
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)

    const productDraft2 = utils.generateProduct(['3', '4'], productType.id)
    productDraft2.slug.de = 'produkte'
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('merge variants v1 and v3 + remove variants v2 and v4', async () => {
    const reassignment = new VariantReassignment(logger, {})
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
      variants: [
        {
          sku: '3',
          prices: []
        }
      ]
    }], [product1, product2])

    const { body: { results } } = await ctpClient.productProjections
      .staged(true)
      .where('masterVariant(sku in ("1", "2", "3", "4"))')
      .where('variants(sku in ("1", "2", "3", "4"))')
      .whereOperator('or')
      .fetch()
    expect(results.length).to.equal(3)
    const updatedProduct1 = results.find(product => product.masterVariant.sku === '1'
      || product.masterVariant.sku === '3')
    expect(updatedProduct1.variants.length).to.equal(1)
    expect(updatedProduct1.id).to.equal(product1.id)
    expect(updatedProduct1.slug.de).to.be.an('object')

    const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
    expect(updatedProduct2.variants.length).to.equal(0)
    expect(updatedProduct2.slug._ctsd).to.exist()
    expect(updatedProduct2.id).to.equal(product2.id)

    const newProduct = results.find(product => product.masterVariant.sku === '2')
    expect(newProduct.variants.length).to.equal(0)
    expect(newProduct.slug._ctsd).to.exist()
  })
})
