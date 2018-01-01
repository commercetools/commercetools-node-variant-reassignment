import _ from 'lodash'
import Promise from 'bluebird'
import shortid from 'shortid'
import * as constant from '../constants'

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
    if (this._isProductPublished(product) && !this._hasProductChanges(product))
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
    const variantsPredicate = `masterVariant(sku IN("${skuPredicate}"))`
      + `or variants(sku IN("${skuPredicate}"))`
    const predicate = `masterData(current(${variantsPredicate}) or staged(${variantsPredicate}))`

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

  async deleteByProduct (product) {
    if (this._isProductPublished(product))
      product = await this.updateProduct(product, [this._getUnpublishAction()])

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

  /**
   * Method will take a product with variants which should be anonymized.
   * It will modify slug, key and name so the product can be created without
   * issues with duplicate fields
   * @param product productDraft
   */
  getAnonymizedProductDraft (product) {
    const salt = this._getSalt()

    // make all languages in slug unique
    for (const lang in product.slug) // eslint-disable-line guard-for-in
      product.slug[lang] += `-${salt}`

    if (product.key)
      product.key += `-${salt}`
    product.slug[constant.PRODUCT_ANONYMIZE_SLUG_KEY] = salt

    return product
  }

  /**
   * Method will take a product with current and staged versions
   * it will unpublish it and update slugs so they are unique across CTP project
   * @param product ctpProduct
   */
  anonymizeCtpProduct (product) {
    const salt = this._getSalt()
    const actions = []

    if (product.masterData.published)
      actions.push({
        action: 'unpublish'
      })

    if (product.key)
      actions.push({
        action: 'setKey',
        key: `${product.key}-${salt}`
      })

    // run through both versions
    for (const version of ['current', 'staged']) {
      const staged = version === 'staged'
      const slugs = product.masterData[version].slug

      for (const lang in slugs) // eslint-disable-line guard-for-in
        slugs[lang] += `-${salt}`

      actions.push({
        action: 'changeSlug',
        slug: slugs,
        staged
      })
    }

    return this.updateProduct(product, actions)
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
    const projectionPublished = product.published
    const masterDataPublished = product.masterData
      && product.masterData.published

    return Boolean(projectionPublished || masterDataPublished)
  }

  _hasProductChanges (product) {
    const projection = product.hasStagedChanges
    const masterData = product.masterData
      && product.masterData.hasStagedChanges

    return Boolean(projection || masterData)
  }

  _getSalt () {
    return shortid.generate() + new Date().getTime()
  }

  getProductDraftSkus (product) {
    const variants = [product.masterVariant].concat(product.variants || [])
    return _.map(variants, 'sku')
  }

  getProductSkus (product) {
    return this.getProductVariants(product).map(v => v.sku)
  }

  getProductVariants (product) {
    return _.values(this.getProductVariantsMapBySku(product))
  }

  getProductVariantsMapBySku (product) {
    const { current, staged } = product.masterData
    return {
      ..._.keyBy(current.variants.concat(current.masterVariant), 'sku'),
      ..._.keyBy(staged.variants.concat(staged.masterVariant), 'sku')
    }
  }

  fetchProductsFromProductProjections (productProjections) {
    const skus = _.flatten(productProjections.map(pP => this.getProductDraftSkus(pP)))
    return this.getProductsBySkus(skus)
  }
}
