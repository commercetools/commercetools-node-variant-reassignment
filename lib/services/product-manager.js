import _ from 'lodash'
import Promise from 'bluebird'
import shortid from 'shortid'
import * as constant from '../constants'

export default class ProductManager {
  constructor (logger, client) {
    this.client = client
    this.logger = logger.child({ service: 'productManager' })
    this.productTypeCache = new Map()

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

  async getProductsBySkusOrSlugs (skus, slugs) {
    // filter out duplicates and divide skus into chunks
    const skuChunks = _(skus).uniq().chunk(this.loadBatchCount).value()
    const slugChunks = _(slugs).uniq().chunk(this.loadBatchCount).value()

    const productBatches = await Promise.map(skuChunks,
      (skuChunk, i) => {
        const slugChunk = slugChunks[i]
        return this._getProductsBySkuOrSlugChunk(skuChunk, slugChunk)
      },
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

  _getProductsBySkuOrSlugChunk (skus, slugs = []) {
    let slugPredicate = null
    if (slugs.length)
      slugPredicate = slugs
        .map(slug => Object.entries(slug)
          .map(([locale, value]) => `${locale}="${value}"`)
          .join(' or '))
        .join(' or ')

    const skuPredicate = skus.join('","')
    const variantsPredicate = `masterVariant(sku IN("${skuPredicate}")) `
      + `or variants(sku IN("${skuPredicate}"))`

    let predicate = `masterData(current(${variantsPredicate}) `
      + `or staged(${variantsPredicate}`
    predicate += slugPredicate ? ` or slug(${slugPredicate})))` : '))'

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
      product = await this._unpublishProduct(product)

    return this.client.products
      .byId(product.id)
      .delete(product.version)
      .return(null)
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
    let unpublishProduct = false

    masterData.current.variants = masterData.current.variants || []
    masterData.staged.variants = masterData.staged.variants || []

    const productVersions = {
      current: this._getVariantsBySkuMap(masterData.current),
      staged: this._getVariantsBySkuMap(masterData.staged)
    }

    const deletedSkus = {
      current: [],
      staged: []
    }

    // delete from map all variants specified in skus param
    Object.keys(productVersions).forEach(version =>
      skus.forEach((sku) => {
        if (productVersions[version][sku]) {
          delete productVersions[version][sku]
          deletedSkus[version].push(sku)
        }
      })
    )

    const retainedSkus = {
      staged: Object.keys(productVersions.staged),
      current: Object.keys(productVersions.current)
    }

    // if there are no variants left delete whole product
    if (retainedSkus.current.length === 0 && retainedSkus.staged.length === 0)
      return this.deleteByProduct(product)

    // if there are no variants left in current:
    //  - publish product so we get staged variants to current
    //  - set unpublish flag so the product is unpublished at the end
    if (retainedSkus.current.length === 0) {
      actions.push(this._getPublishAction())

      // we copied variants from staged to current so we should
      // update also local maps
      deletedSkus.current = _.cloneDeep(deletedSkus.staged)
      retainedSkus.current = _.cloneDeep(retainedSkus.staged)
      productVersions.current = _.cloneDeep(productVersions.staged)
      masterData.current = _.cloneDeep(masterData.staged)
      // unpublish at the end
      unpublishProduct = true
    }

    // if there are no staged variants left
    //  - add all variants from current to staged
    if (retainedSkus.staged.length === 0) {
      retainedSkus.staged = _.cloneDeep(retainedSkus.current)
      productVersions.staged = _.cloneDeep(productVersions.current)

      retainedSkus.staged.forEach(sku =>
        actions.push(
          this._getAddVariantAction(productVersions.current[sku], true)
        )
      )
    }

    // run through both variants (staged and current)
    // first change masterVariants if needed and then remove variants
    ['staged', 'current'].forEach((version) => {
      const variantMap = this._getVariantsBySkuMap(masterData[version])

      // if we deleted a masterVariant, set another variant as new masterVariant
      if (this._isMasterVariantRemoved(masterData[version], retainedSkus[version])) {
        const firstExistingVariant = Object.values(productVersions[version])[0]

        actions.push(
          this._getChangeMasterVariantAction(firstExistingVariant, version === 'staged')
        )
      }

      // remove variants specified in skus param
      // but only if product has this variant
      deletedSkus[version].forEach((sku) => {
        if (variantMap[sku])
          actions.push(
            this._getRemoveVariantAction(variantMap[sku], version === 'staged')
          )
      })
    })

    if (unpublishProduct)
      actions.push(this._getUnpublishAction())

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

      slugs[constant.PRODUCT_ANONYMIZE_SLUG_KEY] = salt

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

  _getPublishAction () {
    return {
      action: 'publish'
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

  fetchProductsFromProductDrafts (productDrafts) {
    const skus = _.flatten(productDrafts.map(pP => this.getProductDraftSkus(pP)))
    const slugs = productDrafts.map(pP => pP.slug)
    return this.getProductsBySkusOrSlugs(skus, slugs)
  }

  async changeProductType (product, newProductTypeId) {
    if (product.masterData.published)
      await this._unpublishProduct(product)

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

  async _unpublishProduct (product) {
    return this.updateProduct(product, [this._getUnpublishAction()])
  }

  /**
   * Ensure that all attributes that have sameForAll constraint will have same value after
   * the reassignment process. The same value is taken either from product draft OR set to null
   * (attr is removed) if attr is not available in product draft.
   * It's necessary to have same attribute values for:
   *
   * 1) variants that will be added to ctpProductToUpdate - done by removing the attribute
   * from the new variants
   *
   * 2) existing variants from ctpProductToUpdate - done by `setAttributeInAllVariants` action
   *
   * @param variants - checks if the values for sameForAll attributes are correct in the variants
   * @param productTypeId - fetch the product type by ID and get all sameForAll attrs for checking
   * @param productDraft - get sameForAll value from the productDraft
   * in case of sameForAll constraint violation
   * @returns {Promise.<Array>} setAttributeInAllVariants actions
   */
  async ensureSameForAllAttributes (variants, productTypeId, productDraft) {
    const actions = []
    const productType = await this._getProductTypeById(productTypeId)
    const sameForAllAttrs = this._selectSameForAllAttrs(productType)
    const violatedAttrs = this._selectViolatedAttrs(variants, sameForAllAttrs)
    violatedAttrs.forEach((attribute) => {
      const value = this._getAttributeValue(attribute.name, productDraft)
      variants.forEach((variant) => {
        const attrFromVariant = variant.attributes.find(a => a.name === attribute.name)
        if (value)
          attrFromVariant.value = value
        else
          _.remove(variant.attributes, a => a.name === attribute.name)
      })
      actions.push({ action: 'setAttributeInAllVariants', name: attribute.name, value })
    })
    return actions
  }

  async _getProductTypeById (productTypeId) {
    let productType = this.productTypeCache.get(productTypeId)
    if (!productType) {
      productType = await this._fetchCtpProductType(productTypeId)
      this.productTypeCache.set(productTypeId, productType)
    }
    return productType
  }

  _getAttributeValue (attributeName, productDraft) {
    let value = null
    if (productDraft) {
      const draftAttr = productDraft.masterVariant.attributes
        .find(a => a.name === attributeName)
      if (draftAttr)
        value = draftAttr.value
    }
    return value
  }

  _selectViolatedAttrs (variants, sameForAllAttrs) {
    return sameForAllAttrs.filter(attr => !this._isAttributeSameForAll(attr, variants))
  }

  _selectSameForAllAttrs (productType) {
    return productType.attributes
      .filter(a => a.attributeConstraint === 'SameForAll')
  }

  _isAttributeSameForAll (attribute, variants) {
    const attrValues = variants.map((variant) => {
      let value = null
      if (variant.attributes) {
        const attr = variant.attributes.find(a => a.name === attribute.name)
        value = attr ? attr.value : null
      }
      return value
    })
    return _.uniq(attrValues).length <= 1
  }

  _fetchCtpProductType (productTypeId) {
    return this.client.productTypes
      .byId(productTypeId)
      .fetch()
      .then(res => res.body)
  }
}
