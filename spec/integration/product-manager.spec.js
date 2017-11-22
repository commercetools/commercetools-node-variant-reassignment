import _ from 'lodash'
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
    sku: '123'
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
    await utils.deleteResource(ctpClient.products)
    productType = await utils.ensureProductType(ctpClient)
    mockProduct.productType.id = productType.id
  })

  beforeEach(() =>
    productService = new ProductManager(utils.logger, ctpClient)
  )

  afterEach(() =>
    utils.deleteResource(ctpClient.products)
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
      const createdProduct = await productService.createProduct(newProduct)
      await productService.deleteProductById(createdProduct.id)

      const deletedProduct = await productService.getProductById(
        createdProduct.id
      )

      expect(deletedProduct).to.be.an('undefined')
    })

    it('should delete a product', async () => {
      const newProduct = getProductMock()
      const createdProduct = await productService.createProduct(newProduct)
      await productService.deleteProduct(createdProduct)

      const deletedProduct = await productService.getProductById(
        createdProduct.id
      )

      expect(deletedProduct).to.be.an('undefined')
    })
  })
  //
  // describe('Remove variants from a product', () => {
  //   it('should remove variants from a product', async () => {
  //     const newProduct = getProductMock()
  //
  //     const createdProduct = await productService.createProduct(newProduct)
  //     await productService.deleteProduct(createdProduct)
  //
  //     const deletedProduct = await productService.getProductById(
  //       createdProduct.id
  //     )
  //
  //     expect(deletedProduct).to.be.an('undefined')
  //   })
  // })
})
