import _ from 'lodash'
import Promise from 'bluebird'
import ProductService from '../services/product-manager'
import TransactionService from '../services/transaction-manager'

export default class VariantReassignment {

  constructor (client, logger, options = {}, blackList = [], retainExistingAttributes = []) {
    this.firstRun = true
    this.customObjectService = null // build custom object service
    this.blackList = blackList
    this.options = options
    this.logger = logger
    this.retainExistingAttributes = retainExistingAttributes
    this.productService = new ProductService(logger, client)
    this.transactionService = new TransactionService(logger, client)
  }

  /**
   * Take a list of product drafts and existing products matched by sku
   *  - for every productDraft check if reassignment is needed
   *  - if yes, create and process actions which will move variants across products
   * @param productDrafts List of productDrafts
   * @param existingProductProjections List of existing products matching by SKU
   * @returns {Promise.<*>}
   */
  async execute (productDrafts, existingProductProjections) {
    let products

    try {
      if (this.firstRun)
        await this._processUnfinishedTransactions()
    } catch (e) {
      return this._error('Could not process unfinished transactions', e)
    }
    this.firstRun = false

    try {
      products
        = await this.productService.fetchProductsFromProductProjections(existingProductProjections)
    } catch (e) {
      return this._error('Error while fetching products for reassignment', e)
    }

    const productDraftsForReassignment
      = this._selectProductDraftsForReassignment(productDrafts, products)

    this.logger.debug(
      'Filtered %d productDrafts for reassignment',
      productDraftsForReassignment.length
    )

    for (const productDraft of productDraftsForReassignment)
      try {
        await this._processProductDraft(productDraft, products)
      } catch (e) {
        this.logger.error(
          'Error while processing productDraft %j, retrying.',
          productDraft.name, e.stack
        )
        await this._handleProcessingError(productDraft, products)
      } finally {
        this.logger.debug(
          'Finished processing of productDraft with name %j',
          productDraft.name
        )
      }

    return Promise.resolve()
  }

  async _handleProcessingError (productDraft, products) {
    const transactions = await this.transactionService.getTransactions()
    const failedTransaction = transactions.find(({ value }) =>
      _.isEqual(value.newProductDraft.name, productDraft.name)
    )

    return failedTransaction
      // transaction was created but not finished, try to finish it
      ? this._processUnfinishedTransactions(transactions)
      // transaction was not created, try to process productDraft again
      : this._processProductDraft(productDraft, products)
  }

  /**
   * Log error and return Promise.reject
   * @param msg String with error description
   * @param e Error object with details
   * @return <Promise.reject>
   * @private
   */
  _error (msg, e) {
    const error = (e && e.message) || String(e)
    this.logger.error(msg, e)
    return Promise.reject(new Error(`${msg} - ${error}`))
  }

  /**
   * Load unfinished transactions from customObject and try to finish them
   * @private
   */
  async _processUnfinishedTransactions (transactions = null) {
    if (!transactions) {
      this.logger.debug('Loading unfinished transactions')
      transactions = await this.transactionService.getTransactions()
    }

    for (const transactionObject of transactions) {
      const { key, value: transaction } = transactionObject

      this.logger.debug('Processing unfinished transaction with key %s', key)
      try {
        await this._createAndExecuteActions(
          transaction.newProductDraft,
          transaction.backupProductDraft,
          transaction.variants,
          transaction.ctpProductToUpdate,
          transactionObject
        )
        await this.transactionService.deleteTransaction(key)
      } catch (e) {
        this.logger.error('Could not process unfinished transaction', e)
        throw e
      }
    }
  }

  async _processProductDraft (productDraft, products) {
    this.logger.debug(
      'Processing reassignment for productDraft with name %j',
      productDraft.name
    )

    const matchingProducts = await this._selectMatchingProducts(productDraft, products)

    if (matchingProducts.length === 0)
      return

    // select using SLUG, etc..
    const ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts)
    this.logger.debug('Selected ctpProductToUpdate with id "%s"', ctpProductToUpdate.id)

    // get variants and draft to backup
    const { matchingProductsVars: backupVariants, ctpProductToUpdateVars: variantsToProcess }
      = this._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate)

    const anonymizedProductDraft
      = this._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess)

    this.logger.debug(
      'Will remove %d and reassign %d variants',
      variantsToProcess.length, backupVariants.length
    )

    // create a backup object
    const transaction
      = await this._backupToCustomObject(productDraft, backupVariants, anonymizedProductDraft)

    await this._createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants,
      ctpProductToUpdate, transaction, matchingProducts)
    await this.transactionService.deleteTransaction(transaction.key)
  }

  async _createAndExecuteActions (productDraft, anonymizedProductDraft, backupVariants,
                                  ctpProductToUpdate, transaction, matchingProducts) {
    // load products for backupVariants -> matching products
    if (!matchingProducts) {
      matchingProducts = await this._selectMatchingProducts(productDraft)
      // load CTP product to update for backupProductDraft -> CTP product to update

      const productToUpdateCandidate
        = this._selectCtpProductToUpdate(productDraft, matchingProducts)

      // if there is no ctpProductToUpdate or it is the same as candidate, take candidate
      if (!ctpProductToUpdate
        ||
        this.productService.isProductsSame(productToUpdateCandidate, ctpProductToUpdate)
      )
        ctpProductToUpdate = productToUpdateCandidate
      else
        // ctpProductToUpdate has been deleted and not recreated with correct product type id
        ctpProductToUpdate = await this._createNewProduct(
          ctpProductToUpdate, productDraft.productType.id
        )
    }

    // check if product types are the same for productDraft and CTP product to update
    const ctpProductTypeId = ctpProductToUpdate.productType.id
    const draftProductType = productDraft.productType.id
    if (draftProductType !== ctpProductTypeId)
      ctpProductToUpdate = await this._changeProductType(
        transaction, ctpProductToUpdate, draftProductType
      )

    matchingProducts = matchingProducts.filter(product => product.id !== ctpProductToUpdate.id)
    matchingProducts
      = await this._removeVariantsFromMatchingProducts(backupVariants, matchingProducts)

    // when creating variant, also ensure about sameForAll attrs - Examples 9,10,11
    ctpProductToUpdate = await this._createVariantsInCtpProductToUpdate(backupVariants,
      productDraft, ctpProductToUpdate)

    // this is done only when variants are removed from ctpProductToUpdate
    if (anonymizedProductDraft) {
      await this._removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate)
      await this._ensureAnonymizedProductDraft(anonymizedProductDraft)
    }

    // e.g. Example 7
    await this._ensureSlugUniqueness(productDraft, matchingProducts)
  }

  /**
   * match by variant sku - pick CTP product that has all variants
   *                        matches product draft
   * match by slug - pick CTP product that has at least one slug language
   *                        that matches product draft slug
   * match by same masterVariant sku - pick CTP product that has same master
   *                        variant as the product draft
   * take the first CTP product
   */
  _selectCtpProductToUpdate (productDraft, products) {
    const matchBySkus = this._getProductMatchByVariantSkus(productDraft, products)
    if (matchBySkus)
      return matchBySkus
    const matchBySlug = this._getProductsMatchBySlug(productDraft, products)
    if (matchBySlug.length === 1)
      return matchBySlug[0]
    const matchByMasterVariant = this._getProductsMatchByMasterVariant(productDraft, matchBySlug)
    return matchByMasterVariant || products[0]
  }

  _getProductMatchByVariantSkus (productDraft, products) {
    let matchedProduct = null
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft)
    for (const product of products) {
      const productSkus = this.productService.getProductSkus(product)
      // https://lodash.com/docs/4.17.4#xor
      if (_.isEmpty(_.xor(productDraftSkus, productSkus))) {
        matchedProduct = product
        break
      }
    }
    return matchedProduct
  }

  _getProductsMatchBySlug (productDraft, products) {
    const matchedProducts = []
    const productDraftSlugs = productDraft.slug
    for (const product of products)
      for (const [lang, slug] of Object.entries(productDraftSlugs))
        if (product.masterData.staged.slug[lang] === slug) {
          matchedProducts.push(product)
          break
        }
    return matchedProducts
  }

  _getProductsMatchByMasterVariant (productDraft, products) {
    const masterVariantSku = productDraft.masterVariant.sku
    return products.find(p => p.masterData.staged.masterVariant.sku === masterVariantSku)
  }

  _selectProductDraftsForReassignment (productDrafts, ctpProducts) {
    const skuToProductMap = this._createSkuToProductMap(ctpProducts)
    return productDrafts.filter(productDraft =>
      this._isReassignmentNeeded(productDraft, skuToProductMap)
    )
  }

  _createSkuToProductMap (ctpProducts) {
    const skuToProductMap = new Map()
    ctpProducts.forEach((p) => {
      const skus = this.productService.getProductSkus(p)
      skus.forEach(sku => skuToProductMap.set(sku, p))
    })
    return skuToProductMap
  }

  /**
   * Product draft needs reassignment in these cases:
   * 1. more than 1 product matches the draft's SKUs
   * 2. or CTP product (staged or current) does not have exact SKU match with product draft
   * 3. or product type is not the same
   */
  _isReassignmentNeeded (productDraft, skuToProductMap) {
    const productSet = new Set()
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft)
    productDraftSkus.forEach((sku) => {
      const product = skuToProductMap.get(sku)
      if (product)
        productSet.add(product)
    })
    if (productSet.size === 0)
    // new product from the product draft
      return false
    else if (productSet.size === 1) {
      // check if CTP product have exact SKU match with product draft
      const product = productSet.values().next().value
      const draftSkus = this.productService.getProductDraftSkus(productDraft)
      const productSkus = this.productService.getProductSkus(product)

      if (_.isEqual(draftSkus, productSkus))
      // variants are assigned correctly, maybe we need to change product type
        return product.productType.id !== productDraft.productType.id
    }
    return true
  }

  /**
   * Variants will be removed from a product for 2 reasons:
   * 1) variants will be moved to a CTP product to update from matching products
   * 2) variants needs to be removed from CTP product to update because they don't exist
   * in the new product draft anymore
   *
   * @param productDraft
   * @param matchingProducts
   * @param ctpProductToUpdate
   * @returns {{matchingProductsVariants, ctpProductToUpdateVariants}}
   * @private
   */
  _getRemovedVariants (productDraft, matchingProducts, ctpProductToUpdate) {
    const productsToRemoveVariants = matchingProducts.filter(p => p !== ctpProductToUpdate)
    const skus = this.productService.getProductDraftSkus(productDraft)

    // variants that needs to be moved from matching product
    const matchingProductsVariants = productsToRemoveVariants.map(product =>
      this._selectVariantsWithCondition(product, variant => skus.includes(variant.sku))
    )

    // variants that needs to be removed from CTP product to update
    const ctpProductToUpdateVariants = this._selectVariantsWithCondition(ctpProductToUpdate,
      variant => !skus.includes(variant.sku)
    )

    return {
      matchingProductsVars: _.flatten(matchingProductsVariants),
      ctpProductToUpdateVars: ctpProductToUpdateVariants
    }
  }

  _selectVariantsWithCondition (product, condition) {
    const skuToVariantObject = this.productService.getProductVariantsMapBySku(product)
    const variants = _.values(skuToVariantObject)
    return variants.filter(condition)
  }

  _createProductDraftWithRemovedVariants (product, variantsToBackup) {
    let productDraftClone
    if (variantsToBackup.length > 0) {
      productDraftClone = _.cloneDeep(product.masterData.staged)
      productDraftClone.key = product.key
      productDraftClone.productType = product.productType
      productDraftClone.taxCategory = product.taxCategory
      productDraftClone.state = product.state
      productDraftClone.reviewRatingStatistics = product.reviewRatingStatistics
      productDraftClone.masterVariant = variantsToBackup[0]
      productDraftClone.variants = variantsToBackup.slice(1, variantsToBackup.length)
      productDraftClone = this.productService.getAnonymizedProductDraft(productDraftClone)
    }

    return productDraftClone
  }

  _backupToCustomObject (newProductDraft, variants, backupProductDraft) {
    const transaction = {
      newProductDraft,
      variants
    }
    if (backupProductDraft)
      transaction.backupProductDraft = backupProductDraft
    return this.transactionService.createTransaction(transaction)
  }

  /**
   * Select products that has at least one variant from the productDraft.
   * @param productDraft
   * @param products
   * @returns {*}
   * @private
   */
  _selectMatchingProducts (productDraft, products) {
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft)
    if (products) {
      const skuToProductMap = this._createSkuToProductMap(products)
      const matchingProducts = productDraftSkus.map(sku => skuToProductMap.get(sku))

      // when there is a new non existing variant in product draft we will get undefined
      // in matchingProducts because there is no existing product so with _.compact we
      // will remove undefined value and work only with variants which are existing on API
      // and should be reassigned
      return _.uniq(_.compact(matchingProducts))
    }
    return this.productService.getProductsBySkus(productDraftSkus)
  }

  _createNewProduct (product, productTypeId) {
    product.productType.id = productTypeId

    const projection = this.productService.transformProductToProjection(product)
    projection.productType.id = productTypeId
    return this.productService.createProduct(projection)
  }

  async _ensureAnonymizedProductDraft (anonymizedProductDraft) {
    const { sku } = anonymizedProductDraft.masterVariant
    const products = await this.productService.getProductsBySkus([sku])

    // anonymizedProduct draft hasn't been created yet
    if (!products.length)
      await this.productService.createProduct(anonymizedProductDraft)
  }

  /**
   * Create a backup of a product because we need to do product type change for this product
   */
  async _backupProductForProductTypeChange (transactionObject, ctpProductToUpdate) {
    if (!transactionObject.ctpProductToUpdate) {
      const transactionKey = transactionObject.key
      const transaction = await this.transactionService.getTransaction(transactionKey)
      transaction.ctpProductToUpdate = ctpProductToUpdate

      await this.transactionService.upsertTransactionByKey(transaction, transactionKey)
    }
  }

  async _changeProductType (transaction, ctpProductToUpdate, productTypeId) {
    this.logger.debug(
      'Changing productType of product %j with id "%s" to productType "%s"',
      ctpProductToUpdate.masterData.current.name,
      ctpProductToUpdate.id, productTypeId
    )

    await this._backupProductForProductTypeChange(transaction, ctpProductToUpdate)

    const updatedProduct = await this.productService.changeProductType(
      ctpProductToUpdate, productTypeId
    )
    await this._deleteBackupForProductTypeChange(transaction.key)
    return updatedProduct
  }

  /**
   * Delete a backup that was created because of product type change of a product
   */
  async _deleteBackupForProductTypeChange (transactionKey) {
    const transaction = await this.transactionService.getTransaction(transactionKey)
    delete transaction.ctpProductToUpdate
    await this.transactionService.upsertTransactionByKey(transaction, transactionKey)
  }

  /**
   * Verify that there are no other products in the platform that has slugs of productDraft
   * except ctpProductToUpdate. It's enough to check matchingProducts because it's not probable
   * that there will be a product which has no matching variant, but a conflicting slug.
   *
   * @see variant-reassignment-example-7.spec.js
   */
  async _ensureSlugUniqueness (productDraft, matchingProducts) {
    const productDraftSlug = productDraft.slug
    const productsToAnonymize = matchingProducts.filter(product =>
      this._isSlugConflicting(product, productDraftSlug)
    )

    this.logger.debug(
      'Anonymizing %d products because of duplicate slugs',
      productsToAnonymize.length
    )

    await Promise.map(productsToAnonymize, product =>
        this.productService.anonymizeCtpProduct(product)
      , { concurrency: 3 })
  }

  /**
   * The slugs from product and product draft are conflicting
   * when at least one language from product's slug is the same as in product draft slug
   * @param product
   * @param productDraftSlug
   * @returns {boolean}
   * @private
   */
  _isSlugConflicting (product, productDraftSlug) {
    const productDraftSlugLength = Object.keys(productDraftSlug).length

    // if at least one version has conflict in slugs, return true
    for (const version of ['staged', 'current']) {
      const slug = product.masterData[version].slug
      const slugLength = Object.keys(slug).length
      const stagedDraftSlugs = _.merge({}, productDraftSlug, slug)
      const stagedDraftSlugsLength = Object.keys(stagedDraftSlugs).length

      if (slugLength + productDraftSlugLength !== stagedDraftSlugsLength)
        return true
    }
    return false
  }

  _removeVariantsFromCtpProductToUpdate (anonymizedProductDraft, ctpProductToUpdate) {
    const skusToRemove = this.productService.getProductDraftSkus(anonymizedProductDraft)
    this.logger.debug('Removing %d variants from ctpProductToUpdate', skusToRemove.length)
    return this.productService.removeVariantsFromProduct(ctpProductToUpdate, skusToRemove)
  }

  async _createVariantsInCtpProductToUpdate (backupVariants, productDraft, ctpProductToUpdate) {
    const actions = []
    const skuToVariant = new Map()
    const existingSkus = this.productService.getProductSkus(ctpProductToUpdate)
    const variants = productDraft.variants || []
    variants.concat(productDraft.masterVariant).forEach((v) => {
      if (!existingSkus.includes(v.sku))
        skuToVariant.set(v.sku, v)
    })
    // preserve existing attribute data
    if (!_.isEmpty(this.retainExistingAttributes))
      backupVariants.forEach((backupVariant) => {
        const draftVariant = skuToVariant.get(backupVariant.sku)
        this.retainExistingAttributes.forEach((attrName) => {
          // https://lodash.com/docs/4.17.4#at
          const retainedAttr = _.at(backupVariant, attrName)
          if (retainedAttr.length > 0)
            draftVariant[attrName] = retainedAttr[0]
        })
      })
    // create actions
    for (const [sku, variant] of skuToVariant)
      actions.push({
        action: 'addVariant',
        sku,
        key: variant.key,
        prices: variant.prices,
        images: variant.images,
        attributes: variant.attributes
      })

    this.logger.debug('Updating ctpProductToUpdate with %d addVariant actions', actions.length)
    return this.productService.updateProduct(ctpProductToUpdate, actions)
  }

  async _removeVariantsFromMatchingProducts (backupVariants, matchingProducts) {
    const productToSkusToRemoveMap = new Map()
    const skuToProductMap = matchingProducts.reduce((resultMap, p) => {
      this.productService.getProductVariants(p).forEach((v) => {
        resultMap.set(v.sku, p)
      })
      return resultMap
    }, new Map())

    for (const variant of backupVariants) {
      const product = skuToProductMap.get(variant.sku)
      const actions = productToSkusToRemoveMap.get(product) || []

      // if there is a product from where we can delete variant..
      if (product) {
        actions.push(variant.sku)
        productToSkusToRemoveMap.set(product, actions)
      }
    }

    this.logger.debug('Removing variants from matching products')
    return Promise.map(Array.from(productToSkusToRemoveMap), ([product, skus]) =>
        this.productService.removeVariantsFromProduct(product, skus),
      { concurrency: 3 })
      .then(_.compact)
  }

}
