import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 +---------+----------------------------+----------------------------+----------------------------+--------------------+----------------------------+-------------------------------------------------------------+
 |         |        Product draft       |         CTP product        |         CTP product        | After reassignment |         CTP product        |                         CTP product                         |
 +---------+----------------------------+----------------------------+----------------------------+                    +----------------------------+-------------------------------------------------------------+
 | Staged  | Product:                   | Product:                   | Product:                   |                    | Product:                   | Product:                                                    |
 |         | slug: { en: "product" }    | id: 1                      | id: 2                      |                    | id: 1                      | id: 3                                                       |
 |         | product-type: "pt2"        | slug: { en: "product" }    | slug: { en: "product-2" }  |                    | slug: { en: "product" }    | slug: { en: "product-${timestamp}", _ctsd: "${timestamp}" } |
 |         | masterVariant: { sku: v1 } | product-type: "pt2"        | product-type: "pt2"        |                    | product-type: "pt2"        | product-type: "pt2"                                         |
 |         | variants: { sku: v2 }      | masterVariant: { sku: v1 } | masterVariant: { sku: v2 } |                    | masterVariant: { sku: v1 } | masterVariant: { sku: v3 }                                  |
 |         |                            |                            |                            |                    | variants: { sku: v2 }      |                                                             |
 +---------+----------------------------+----------------------------+----------------------------+                    +----------------------------+-------------------------------------------------------------+
 | Current |                            | Product:                   | Product:                   |                    | Product:                   |                                                             |
 |         |                            | id: 1                      | id: 2                      |                    | id: 1                      |                                                             |
 |         |                            | slug: { en: "product" }    | slug: { en: "product-2" }  |                    | slug: { en: "product" }    |                                                             |
 |         |                            | product-type: "pt2"        | product-type: "pt2"        |                    | product-type: "pt2"        |                                                             |
 |         |                            | masterVariant: { sku: v1 } | masterVariant: { sku: v2 } |                    | masterVariant: { sku: v1 } |                                                             |
 |         |                            | variants: { sku: v3 }      |                            |                    |                            |                                                             |
 +---------+----------------------------+----------------------------+----------------------------+--------------------+----------------------------+-------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe.skip('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()

    let product1Response = await utils.createCtpProducts([['1', '3']], ctpClient)
    product1 = product1Response[0]
    product1Response = await ctpClient.products
      .byId(product1.id)
      .update({
        version: product1.version,
        actions: [{ action: 'publish' }]
      })
    await ctpClient.products
      .byId(product1.id)
      .update({
        version: product1Response.body.version,
        actions: [
          { action: 'removeVariant', id: product1.variants[0].id }
        ]
      })

    const product2Response = await utils.createCtpProducts([['2']], ctpClient)
    product2 = product2Response[0]
    await ctpClient.products
      .byId(product2.id)
      .update({
        version: product2.version,
        actions: [{ action: 'publish' }]
      })
  })

  after(async () => {
    await utils.unpublishAllProducts(ctpClient, logger)
    await utils.deleteResourcesAll(ctpClient, logger)
  })

  it('different products on staged and current AND different variants on staged and current',
    async () => {
      const reassignment = new VariantReassignment(ctpClient, logger, {}, [])
      await reassignment.execute([{
        productType: product1.productType,
        name: product1.name,
        slug: product1.slug,
        masterVariant: product1.masterVariant,
        variants: [{
          sku: '2'
        }]
      }], [product1, product2])
      const { body: product1After } = await ctpClient.products.byId(product1.id).fetch()
      expect(product1After.masterData.current.masterVariant.sku).to.equal('1')
      expect(product1After.masterData.staged.masterVariant.sku).to.equal('1')
      expect(product1After.masterData.current.variants.length).to.equal(0)
      expect(product1After.masterData.staged.variants[0].sku).to.equal('2')
      expect(product1After.masterData.published).to.equal(true)
      expect(product1After.masterData.hasStagedChanges).to.equal(true)

      const { body: { newProduct } } = await utils.getProductsBySkus(['3'], ctpClient)
      expect(newProduct.masterData.staged.masterVariant.sku).to.equal('3')
      expect(newProduct.masterData.staged.slug._ctsd).to.be.a('string')
      expect(newProduct.masterData.staged.variants.length).to.equal(0)
      expect(newProduct.masterData.published).to.equal(false)
      expect(product1After.masterData.hasStagedChanges).to.equal(true)
    })
})
