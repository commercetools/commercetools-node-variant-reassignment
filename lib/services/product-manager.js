import _ from 'lodash'
import Promise from 'bluebird'
import { unpublish } from '../utils/utils'

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
    if (this._isProductPublished(product))
      return Promise.resolve(product)

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
      .then(res => res.body)
  }

  async getProductsBySkus (skus) {
    // filter out duplicates and divide skus into chunks
    const skuChunks = _(skus).uniq().chunk(this.loadBatchCount).value()

    const productBatches = await Promise.map(
      skuChunks, skuChunk => this._getProductsBySkuChunk(skuChunk),
      { concurrency: this.loadConcurrency } // load products with concurrency
    )
    return this._filterOutDuplicateProducts(_.flatten(productBatches))
  }

  _filterOutDuplicateProducts (products) {
    return _.uniqBy(products, 'id')
  }

  _getProductsBySkuChunk (skus) {
    const skuPredicate = skus.join('","')
    const predicate = `masterData(current(masterVariant(sku IN("${skuPredicate}")) `
      + `or variants(sku IN("${skuPredicate}"))) `
      + `or staged(masterVariant(sku IN("${skuPredicate}")) `
      + `or variants(sku IN("${skuPredicate}"))))`

    return this.client.products
      .where(predicate)
      .fetch()
      .then(res => res.body.results)
  }

  getProductById (id) {
    return this.client.products
      .byId(id)
      .fetch()
      .then(res => res.body)
      .catch(err => (
        err && err.body && err.body.statusCode === 404
          ? Promise.resolve(undefined)
          : Promise.reject(err)
      ))
  }

  async deleteByProductId (id) {
    const product = await this.getProductById(id)

    return product
      ? this.deleteByProduct(product)
      : Promise.resolve()
  }

  deleteByProduct (product) {
    return this.client.products
      .byId(product.id)
      .delete(product.version)
  }

  /**
   * Function accepts product with staged and current version and a list of SKUs
   * which will be deleted from a product. It creates and executes actions in
   * this order:
   *  - delete product if all variants are being removed
   *  - unpublish product if all current variants are being removed
   *  - add variants from current to staged if there won't be any staged
   *    variants left and vice versa
   *  - change masterVariant to another variant if we are removing masterVariant
   *  - remove selected variants
   * @param product Product object
   * @param skus List of SKUs
   */
  removeVariantsFromProduct (product, skus) {
    const masterData = product.masterData
    const actions = []

    masterData.current.variants = masterData.current.variants || []
    masterData.staged.variants = masterData.staged.variants || []

    const productVersions = {
      current: this._getVariantsBySkuMap(masterData.current),
      staged: this._getVariantsBySkuMap(masterData.staged)
    }

    // delete from map all variants specified in skus param
    Object.keys(productVersions).forEach(version =>
      skus.forEach((sku) => {
        delete productVersions[version][sku]
      })
    )

    let currentSkus = Object.keys(productVersions.current)
    let stagedSkus = Object.keys(productVersions.staged)

    // if there are no variants left delete whole product
    if (currentSkus.length === 0 && stagedSkus.length === 0)
      return this.deleteByProduct(product)

    // if there are no current variants left
    //  - unpublish product
    //  - add all variants from staged to current
    if (currentSkus.length === 0) {
      currentSkus = _.cloneDeep(stagedSkus)
      productVersions.current = _.cloneDeep(productVersions.staged)

      actions.push(this._getUnpublishAction())
      stagedSkus.forEach(sku =>
        actions.push(
          this._getAddVariantAction(productVersions.staged[sku], false)
        )
      )
    }

    // if there are no staged variants left
    //  - add all variants from current to staged
    if (stagedSkus.length === 0) {
      stagedSkus = _.cloneDeep(currentSkus)
      productVersions.staged = _.cloneDeep(productVersions.current)

      stagedSkus.forEach(sku =>
        actions.push(
          this._getAddVariantAction(productVersions.current[sku], true)
        )
      )
    }

    // if we want to delete a masterVariant from current, set another variant as
    // new masterVariant first
    if (this._isMasterVariantRemoved(masterData.current, currentSkus)) {
      const firstExistingVariant = Object.values(productVersions.current)[0]

      actions.push(
        this._getChangeMasterVariantAction(firstExistingVariant, false)
      )
    }

    // if we want to delete a masterVariant from staged, set another variant as
    // new masterVariant first
    if (this._isMasterVariantRemoved(masterData.staged, stagedSkus)) {
      const firstExistingVariant = Object.values(productVersions.staged)[0]

      actions.push(
        this._getChangeMasterVariantAction(firstExistingVariant, true)
      )
    }

    // run through both variants (staged and current)
    // first remove variants from staged
    ['staged', 'current'].forEach((version) => {
      const variantMap = this._getVariantsBySkuMap(masterData[version])

      // remove variants specified in skus param
      // but only if product has this variant
      skus.forEach((sku) => {
        if (variantMap[sku])
          actions.push(
            this._getRemoveVariantAction(variantMap[sku], version === 'staged')
          )
      })
    })

    return actions.length
      ? this.updateProduct(product, actions)
      : Promise.resolve(product)
  }

  // create map of variants indexed by their sku
  _getVariantsBySkuMap (product) {
    return [product.masterVariant, ...product.variants]
      .reduce((map, variant) => {
        map[variant.sku] = variant
        return map
      }, {})
  }

  _getUnpublishAction () {
    return {
      action: 'unpublish'
    }
  }

  _getAddVariantAction (variant, staged = true) {
    return {
      action: 'addVariant',
      staged,
      ...variant
    }
  }

  _getChangeMasterVariantAction (variant, staged = true) {
    const action = {
      action: 'changeMasterVariant',
      staged
    }
    if (variant.variantId)
      action.variantId = variant.variantId
    else
      action.sku = variant.sku

    return action
  }

  _isMasterVariantRemoved (product, existingSkus) {
    return !existingSkus.includes(product.masterVariant.sku)
  }

  _getRemoveVariantAction (variant, staged = true) {
    const action = {
      action: 'removeVariant',
      staged
    }

    if (variant.variantId)
      action.id = variant.variantId
    else
      action.sku = variant.sku

    return action
  }

  /**
   * Test if product or productProjection is published
   * @param product Product or ProductProjection object
   * @returns {boolean}
   * @private
   */
  _isProductPublished (product) {
    const projectionPublished = product.published && !product.hasStagedChanges
    const masterDataPublished = product.masterData
      && product.masterData.published
      && !product.masterData.hasStagedChanges

    return Boolean(projectionPublished || masterDataPublished)
  }

  async changeProductType (product, newProductTypeId) {
    if (product.masterData.published)
      await this.client.products
        .byId(product.id)
        .update(unpublish(product.version))

    // fetch from product projection because it has same structure
    // as product draft. It's easier for product creation later in the process
    const { body: productProjection } = await this.client.productProjections
      .staged(true)
      .byId(product.id)
      .fetch()

    await this.deleteByProduct(productProjection)

    productProjection.productType.id = newProductTypeId
    return this.createProduct(productProjection)
  }

  /**
   * Compare if two products are the same.
   * 1. by product id
   * 2. by product type id and by slug
   */
  isProductsSame (ctpProduct1, ctpProduct2) {
    if (ctpProduct1.id === ctpProduct2.id)
      return true
    return ctpProduct1.productType.id === ctpProduct2.productType.id
      && _.deepEqual(ctpProduct1.masterData.staged.slug, ctpProduct2.masterData.staged.slug)
  }
}
