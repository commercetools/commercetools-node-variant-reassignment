import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

const productTypeDraft2 = require('../../resources/productType.json')

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2
  let productType2

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)

    productTypeDraft2.name = 'product-type-2'
    productType2 = await utils.ensureResource(ctpClient.productTypes,
      productTypeDraft2)
    const productDraft2 = utils.generateProduct(['3'], productType2.id)
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('removing variant v2 + moving variant v3 from a different productType + deleting product p2',
    async () => {
      const reassignment = new VariantReassignment(logger, {})
      await reassignment.execute([{
        productType: {
          id: productType2.id
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
      }], [product1, product2])
      const { body: { results } } = await ctpClient.productProjections
        .staged(true)
        .where('masterVariant(sku in ("1", "2", "3"))')
        .where('variants(sku in ("1", "2", "3"))')
        .whereOperator('or')
        .fetch()
      expect(results.length).to.equal(2)
      const updatedProduct = results.find(product => product.masterVariant.sku === '1')
      expect(updatedProduct).to.exist()
      expect(updatedProduct.variants.length).to.equal(1)

      const newProduct = results.find(product => product.masterVariant.sku === '2')
      expect(newProduct.productType.id).to.equal(updatedProduct.productType.id)
      expect(newProduct.variants.length).to.equal(0)
    })
})
