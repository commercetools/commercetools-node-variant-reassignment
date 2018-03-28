import _ from 'lodash'
import Promise from 'bluebird'
import errorToJson from 'utils-error-to-json'
import ProductService from '../services/product-manager'
import TransactionService from '../services/transaction-manager'

export default class VariantReassignment {

  constructor (client, logger, retainExistingData = []) {
    // When we run execute method it also fetch and process all unfinished transactions
    // but only for the first time - this is ensured by firstRun variable which is set to false
    // after first run
    this.firstRun = true
    this.retainExistingData = retainExistingData
    this.logger = logger
    this.productService = new ProductService(logger, client)
    this.transactionService = new TransactionService(logger, client)
  }

  /**
   * Take a list of product drafts and existing products matched by sku
   *  - for every productDraft check if reassignment is needed
   *  - if yes, create and process actions which will move variants across products
   * @param productDrafts List of productDrafts
   * @param productTypeNameToTypeObj product type cache to resolve product type references
   * @returns {Promise.<*>} true if reassignment has been executed
   */
  async execute (productDrafts, productTypeNameToTypeObj = {}) {
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
        = await this.productService.fetchProductsFromProductDrafts(productDrafts)
    } catch (e) {
      return this._error('Error while fetching products for reassignment', e)
    }

    productDrafts = this._resolveProductTypeReferences(productDrafts, productTypeNameToTypeObj)

    const productDraftsForReassignment
      = this._selectProductDraftsForReassignment(productDrafts, products)

    this.logger.debug(
      `Filtered ${productDraftsForReassignment.length} productDrafts for reassignment`
    )

    const isReassignmentRequired = productDraftsForReassignment.length
    if (isReassignmentRequired) {
      for (const productDraft of productDraftsForReassignment)
        try {
          await this._processProductDraft(productDraft, products)
        } catch (e) {
          const error = e instanceof Error ? errorToJson(e) : e
          this.logger.error(
            `Error while processing productDraft ${JSON.stringify(productDraft.name)}, retrying.`,
            error
          )
          await this._handleProcessingError(productDraft, products)
        } finally {
          this.logger.debug(
            `Finished processing of productDraft with name ${JSON.stringify(productDraft.name)}`
          )
        }
      return true
    }
    return false
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
    const error = e instanceof Error ? errorToJson(e) : e
    this.logger.error(msg, e)
    return Promise.reject(new Error(`${msg} - ${JSON.stringify(error)}`))
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

      this.logger.debug(`Processing unfinished transaction with key ${key}`)
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
        const error = e instanceof Error ? errorToJson(e) : e
        this.logger.error('Could not process unfinished transaction', error)
        throw e
      }
    }
  }

  async _processProductDraft (productDraft, products) {
    this.logger.debug(
      `Processing reassignment for productDraft with name ${JSON.stringify(productDraft.name)}`
    )

    const matchingProducts = await this._selectMatchingProducts(productDraft, products)

    if (matchingProducts.length === 0)
      return

    // select using SLUG, etc..
    const ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts)
    this.logger.debug(`Selected ctpProductToUpdate with id "${ctpProductToUpdate.id}"`)

    // get variants and draft to backup
    const { matchingProductsVars: backupVariants, ctpProductToUpdateVars: variantsToProcess }
      = this._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate)

    const anonymizedProductDraft
      = this._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess)

    this.logger.debug(
      `Will remove ${variantsToProcess.length} and reassign ${backupVariants.length} variants`
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
    matchingProducts = matchingProducts.filter(product => product.id !== ctpProductToUpdate.id)
    if (draftProductType !== ctpProductTypeId)
      ctpProductToUpdate = await this._changeProductType(
        transaction, ctpProductToUpdate, draftProductType
      )
    matchingProducts
      = await this._removeVariantsFromMatchingProducts(backupVariants, matchingProducts)

    // when creating variant, also ensure about sameForAll attrs - Examples 9,10,11
    ctpProductToUpdate = await this._createVariantsInCtpProductToUpdate(backupVariants,
      productDraft, ctpProductToUpdate)

    // this is done only when variants are removed from ctpProductToUpdate
    if (anonymizedProductDraft) {
      await this._removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate)
      await this._ensureProductCreation(anonymizedProductDraft)
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

  /**
   * In productDrafts from external systems, there's no productTypeId, but instead the name is used.
   * However, productTypeId is needed for reassignment. This method replaces the productTypeName
   * with productTypeId if such ID exists.
   */
  _resolveProductTypeReferences (productDrafts, productTypeNameToTypeObj) {
    productDrafts.forEach((productDraft) => {
      const productType = productTypeNameToTypeObj[productDraft.productType.id]
      if (productType)
        productDraft.productType.id = productType.id
    })
    return productDrafts
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
   * 4. or 1 product is matched by SKU and number of variants, but slug is not the same -
   * - in this case, we need to ensure there are no slug conflict with the product draft that can
   * be in a product that does not have any common SKUs
   */
  _isReassignmentNeeded (productDraft, skuToProductMap) {
    const productSet = new Set()
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft)
    productDraftSkus.forEach((sku) => {
      const product = skuToProductMap.get(sku)
      if (product)
        productSet.add(product)
    })
    if (productSet.size === 0) {
      // check for product matches by slug
      const products = Array.from(skuToProductMap.values())
      this._selectMatchingProductsBySlug(products, productDraft)
        .forEach(p => productSet.add(p))
    }
    if (productSet.size === 0)
    // new product from the product draft
      return false
    else if (productSet.size === 1) {
      // check if CTP product have exact SKU match with product draft
      const product = productSet.values().next().value
      const draftSkus = this.productService.getProductDraftSkus(productDraft)
      const productSkus = this.productService.getProductSkus(product)
      if (_.isEqual(draftSkus.sort(), productSkus.sort())) {
        // variants are assigned correctly, maybe we need to change product type
        const productTypeId = product.productType.id
        const productDraftTypeId = productDraft.productType.id
        if (productTypeId === productDraftTypeId)
        // product type are correct, check if product slugs are unique
          return !_.isEqual(product.masterData.staged.slug, productDraft.slug)
      }
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
   * Select products that has at least one variant
   * or at least one matching slug with the productDraft.
   * @param productDraft
   * @param products if present, then this will be used and no fetching from CTP is needed
   * @returns {*}
   * @private
   */
  _selectMatchingProducts (productDraft, products) {
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft)
    const productDraftSlugs = productDraft.slug
    if (products) {
      // select products that matches by at least one slug with productDraft
      const matchingProductsBySlug = this._selectMatchingProductsBySlug(products, productDraft)
      // select products that matches by at least one variant with productDraft
      const matchingProductsBySku = this._selectMatchingProductsBySkus(products,
        productDraftSkus)
      return this.productService.filterOutDuplicateProducts(
        _.compact(matchingProductsBySku.concat(matchingProductsBySlug))
      )
    }
    return this.productService.getProductsBySkusOrSlugs(productDraftSkus, productDraftSlugs)
  }

  /* eslint-disable no-labels */
  _selectMatchingProductsBySlug (products, productDraft) {
    return products.filter((product) => {
      for (const representation of ['staged', 'current']) {
        const productSlug = product.masterData[representation].slug
        for (const locale of Object.keys(productSlug))
          if (productSlug[locale] === productDraft.slug[locale])
            return true
      }
      return false
    })
  }
  /* eslint-enable no-labels */

  _selectMatchingProductsBySkus (products, productDraftSkus) {
    const skuToProductMap = this._createSkuToProductMap(products)
    const matchingProducts = productDraftSkus
      .map(sku => skuToProductMap.get(sku))
    return _.compact(matchingProducts)
  }

  _createNewProduct (product, productTypeId) {
    product.productType.id = productTypeId

    const projection = this.productService.transformProductToProjection(product)
    projection.productType.id = productTypeId
    return this.productService.createProduct(projection)
  }

  async _ensureProductCreation (productDraft) {
    const { sku } = productDraft.masterVariant
    const existingProducts = await this.productService.getProductsBySkus([sku])

    // productDraft hasn't been created yet
    if (!existingProducts.length)
      await this.productService.createProduct(productDraft)
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
      `Changing productType of product `
      + `${JSON.stringify(ctpProductToUpdate.masterData.current.name)} with id `
      + `"${ctpProductToUpdate.id}" to productType "${productTypeId}"`
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
      `Anonymizing ${productsToAnonymize.length} products because of duplicate slugs`
    )

    await Promise.map(productsToAnonymize, product =>
        this.productService.anonymizeCtpProduct(product)
      , { concurrency: 3 })
  }

  /**
   * The slugs from product and product draft are conflicting when at least one language value
   * from product's slug is the same as in product draft slug
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

      const hasSameSlugLang
        = slugLength + productDraftSlugLength !== stagedDraftSlugsLength
      const hasAnySameSlugValue = Object.keys(slug)
        .some(lang => productDraftSlug[lang] === slug[lang])
      if (hasSameSlugLang && hasAnySameSlugValue)
        return true
    }
    return false
  }

  async _removeVariantsFromCtpProductToUpdate (anonymizedProductDraft, ctpProductToUpdate) {
    const skusToRemove = this.productService.getProductDraftSkus(anonymizedProductDraft)
    await this.productService.removeVariantsFromProduct(ctpProductToUpdate, skusToRemove)
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
    if (!_.isEmpty(this.retainExistingData))
      backupVariants.forEach((backupVariant) => {
        const draftVariant = skuToVariant.get(backupVariant.sku)
        this.retainExistingData.forEach((attrName) => {
          // https://lodash.com/docs/4.17.4#at
          const retainedAttr = _.at(backupVariant, attrName)
          if (retainedAttr.length > 0)
            draftVariant[attrName] = retainedAttr[0]
        })
      })

    // ensure sameForAll constraint
    const setAttrActions = await this._ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant,
      productDraft)
    actions.push(...setAttrActions)

    // create addVariant actions
    for (const [sku, variant] of skuToVariant)
      actions.push({
        action: 'addVariant',
        sku,
        key: variant.key,
        prices: variant.prices,
        images: variant.images,
        attributes: variant.attributes
      })

    this.logger.debug(`Updating ctpProductToUpdate with ${actions.length} addVariant actions`)
    return this.productService.updateProduct(ctpProductToUpdate, actions)
  }

  _ensureSameForAllAttributes (ctpProductToUpdate, skuToVariant, productDraft) {
    const variantsToEnsure = [ctpProductToUpdate.masterData.staged.masterVariant]
      .concat(ctpProductToUpdate.masterData.staged.variants)
      .concat(Array.from(skuToVariant.values()))

    return this.productService.ensureSameForAllAttributes(variantsToEnsure,
      productDraft.productType.id, productDraft)
  }

  async _removeVariantsFromMatchingProducts (backupVariants, matchingProducts) {
    if (!backupVariants.length)
      return matchingProducts
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
