import _ from 'lodash'
import sinon from 'sinon'
import { expect } from 'chai'

import * as utils from '../utils/helper'
import ProductManager from '../../lib/services/product-manager'

const mockProduct = {
  name: {
    en: 'Test Product'
  },
  slug: {
    en: 'testProduct'
  },
  masterVariant: {
    sku: '1'
  },
  productType: {
    id: null,
    typeId: 'product-type'
  }
}

let ctpClient = null
let productService = null
let productType = null

function getProductMock () {
  return _.cloneDeep(mockProduct)
}

describe('ProductManager', () => {
  before(async () => {
    ctpClient = await utils.createClient()
    await utils.deleteAllProducts(ctpClient)
    productType = await utils.ensureProductType(ctpClient)
    mockProduct.productType.id = productType.id
  })

  beforeEach(() =>
    productService = new ProductManager(utils.logger, ctpClient)
  )

  afterEach(() =>
    utils.deleteAllProducts(ctpClient)
  )

  describe('Basic functions', () => {
    it('should create a product', async () => {
      const newProduct = getProductMock()
      const createdProduct = await productService.createProduct(newProduct)
      const {
        body: {
          results: products
        }
      } = await ctpClient.productProjections.staged(true).fetch()

      expect(products).to.have.lengthOf(1)
      expect(products[0].id).to.equal(createdProduct.id)
    })

    it('should get a product by its id', async () => {
      const newProduct = getProductMock()
      const createdProduct = await productService.createProduct(newProduct)
      const product = await productService.getProductById(createdProduct.id)

      expect(product).to.be.an('object')
      expect(product.id).to.be.equal(createdProduct.id)
    })

    it('should delete a product using its id', async () => {
      const newProduct = getProductMock()
      const sku = newProduct.masterVariant.sku
      const createdProduct = await productService.createProduct(newProduct)
      let apiProducts = await productService.getProductsBySkus([sku])
      expect(apiProducts).to.have.lengthOf(1)

      await productService.deleteByProductId(createdProduct.id)
      const deletedProduct = await productService.getProductById(
        createdProduct.id
      )
      expect(deletedProduct).to.be.an('undefined')

      apiProducts = await productService.getProductsBySkus([sku])
      expect(apiProducts).to.have.lengthOf(0)
    })

    it('should delete a product', async () => {
      const newProduct = getProductMock()
      const createdProduct = await productService.createProduct(newProduct)
      await productService.deleteByProduct(createdProduct)

      const deletedProduct = await productService.getProductById(
        createdProduct.id
      )

      expect(deletedProduct).to.be.an('undefined')
    })
  })

  describe('Removing variants', () => {
    it('should remove masterVariant from a product', async () => {
      const newProduct = getProductMock()

      newProduct.variants = [{
        sku: '2'
      }]

      let product = await productService.createProduct(newProduct)
      product = await productService.removeVariantsFromProduct(product, ['1'])
      const { current, staged } = product.masterData

      expect(current.masterVariant.sku).to.equal('2')
      expect(current.variants).to.have.lengthOf(0)

      expect(staged.masterVariant.sku).to.equal('2')
      expect(staged.variants).to.have.lengthOf(0)
    })

    it('should remove masterVariant and add variant from staged', async () => {
      const newProduct = getProductMock()
      newProduct.variants = [{
        sku: '2'
      }]

      // add product with two variants
      let product = await productService.createProduct(newProduct)
      // publish product
      product = await productService.publishProduct(product)
      // remove v2 from staged
      product = await productService.updateProduct(product, [{
        action: 'removeVariant',
        sku: '2'
      }])

      product = await productService.removeVariantsFromProduct(product, ['1'])
      const { current, staged } = product.masterData

      expect(current.masterVariant.sku).to.equal('2')
      expect(current.variants).to.have.lengthOf(0)

      expect(staged.masterVariant.sku).to.equal('2')
      expect(staged.variants).to.have.lengthOf(0)

      const spyUnpublish = sinon.spy(productService, 'updateProduct')
      await productService.deleteByProduct(product)

      expect(spyUnpublish.args).to.have.lengthOf(1)
      const updateArgs = spyUnpublish.args[0]

      // we should unpublish before we delete product
      expect(updateArgs[0]).to.be.an('object')
      expect(updateArgs[1]).to.be.an('array')
      expect(updateArgs[1][0]).to.be.an('object')
      expect(updateArgs[1][0].action).to.equal('unpublish')

      const products = await ctpClient.products.fetch()
      expect(products.body.count).to.equal(0)
    })
  })
})
