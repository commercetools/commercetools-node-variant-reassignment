import _ from 'lodash'
import Promise from 'bluebird'

export default class ProductManager {
  constructor (logger, client) {
    this.client = client
    this.logger = logger.child({ service: 'productManager' })

    this.loadBatchCount = 20
    this.loadConcurrency = 2
  }

  createProduct (product) {
    this.logger.debug('Creating product', product)

    return this.client.products
      .create(product)
      .then(res => res.body)
  }

  publishProduct (product) {
    const actions = [{
      action: 'publish'
    }]

    return this.updateProduct(product, actions)
  }

  updateProduct (product, actions) {
    const request = {
      version: product.version,
      actions
    }

    return this.client.products
      .byId(product.id)
      .update(request)
  }

  filterOutDuplicateProducts (products) {
    console.log(products)
    throw new Error('NOT IMPLEMENTED')
  }

  async getProductsBySku (skus) {
    // if skus have more than a certain amount run multiple parallel requests
    if (skus.length > this.loadBatchCount) {
      const productBatches = Promise.map(
        _.chunk(skus, this.loadBatchCount), // load max N skus per one request
        skuBatch => this.getProductsBySku(skuBatch),
        { concurrency: this.loadConcurrency } // load products with concurrency
      )

      return this.filterOutDuplicateProducts(_.flatten(productBatches))
    }

    const skuPredicate = `${skus.join('","')}`
    const predicate = `masterVariant(sku IN("${skuPredicate}"))`
      + ` OR variants(SKU IN("${skuPredicate}")`

    return this.client.productProjections
      .where(predicate)
      .fetch()
      .then(res => res.body.results)
  }

  getProductById (id) {
    return this.client.productProjections
      .staged(true)
      .where(`id="${id}"`)
      .fetch()
      .then(res => res.body.results[0])
  }

  async deleteProductById (id) {
    const product = await this.getProductById(id)

    if (product)
      return this.client.products
        .byId(product.id)
        .delete(product.version)

    return Promise.resolve()
  }

  deleteProduct (product) {
    return this.client.products
      .byId(product.id)
      .delete(product.version)
  }

  removeVariantsFromProduct (product, variantSkus) {
    console.log(product, variantSkus)
    throw new Error('NOT IMPLEMENTED')
  }

  anonymizeProduct (product) {
    console.log(product)
    throw new Error('NOT IMPLEMENTED')
  }

}
