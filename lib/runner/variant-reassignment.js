import _ from 'lodash'
import ProductService from '../services/product-manager'
import TransactionService from '../services/transaction-manager'

export default class VariantReassignment {

  constructor (client, logger, options, blackList) {
    this.unfinishedTransactions = []
    this.firstRun = true
    this.customObjectService = null // build custom object service
    this.blackList = blackList
    this.options = options
    this.logger = logger
    this.productService = new ProductService(logger, client)
    this.transactionService = new TransactionService(logger, client)
  }

  async execute (productDrafts, existingProducts) {
    this._processUnfinishedTransactions()

    const productDraftsForReassignment
      = this._selectProductDraftsForReassignment(productDrafts, existingProducts)

    if (productDraftsForReassignment.length)
      for (const productDraft of productDraftsForReassignment)
        await this._processProductDraft(productDraft)
  }

  async _processUnfinishedTransactions () {
    if (this.firstRun)
      this.unfinishedTransactions = [] // API.getUnfinishedTransactions()

    this.firstRun = false
    for (const transaction of this.unfinishedTransactions)
      await this._createAndExecuteActions(transaction.newProductDraft,
        transaction.backupProductDraft, transaction.variants, transaction.ctpProductToUpdate)
  }

  async _processProductDraft (productDraft) {
    const matchingProducts = await this._fetchMatchingProductsForReassignment(productDraft)

    if (matchingProducts.length === 0)
      return

    // select using SLUG, etc..
    const ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts)

    // get variants and draft to backup
    const { matchingProductsVars: backupVariants, ctpProductToUpdateVars: variantsToProcess }
      = this._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate)
    const anonymizedProductDraft
      = this._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess)

    // create a backup object
    const transaction
      = await this._backupToCustomObject(productDraft, anonymizedProductDraft, backupVariants)

    await this._createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants,
      ctpProductToUpdate, transaction, matchingProducts)

    await this.transactionService.deleteTransaction(transaction.key)
  }

  async _createAndExecuteActions (productDraft, anonymizedProductDraft, backupVariants,
                                  ctpProductToUpdate, transaction, matchingProducts) {
    // load products for backupVariants -> matching products
    if (!matchingProducts) {
      matchingProducts = await this._fetchMatchingProductsForReassignment(productDraft)
      // load CTP product to update for backupProductDraft -> CTP product to update
      const productToUpdateCandidate
        = this._selectCtpProductToUpdate(productDraft, matchingProducts)
      if (this.productService.isProductsSame(productToUpdateCandidate, ctpProductToUpdate))
        ctpProductToUpdate = productToUpdateCandidate
      else
      // ctpProductToUpdate has been deleted and not recreated with correct product type id
        await this._createNewProduct(ctpProductToUpdate, productDraft.productType.id)
    }

    // check if product types are the same for productDraft and CTP product to update
    const ctpProductTypeId = ctpProductToUpdate.productType.id
    const draftProductType = productDraft.productType.id
    if (draftProductType !== ctpProductTypeId)
      ctpProductToUpdate = await this._changeProductType(
        transaction, ctpProductToUpdate, draftProductType
      )
    await this._removeVariantsFromMatchingProducts(backupVariants, matchingProducts)
    // when creating variant, also ensure about sameForAll attrs - Examples 9,10,11
    await this._createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate)

    await this._removeVariantsFromCtpProductToUpdate(
      anonymizedProductDraft, ctpProductToUpdate)
    await this._createAnonymizedProduct(anonymizedProductDraft)
    // e.g. Example 7
    await this._ensureSlugUniqueness(productDraft, ctpProductToUpdate)
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
    let matchedProduct = this._getProductMatchByVariantSkus(productDraft, products)
    if (!matchedProduct) {
      const matchedProductsBySlug = this._getProductsMatchBySlug(productDraft, products)
      if (matchedProductsBySlug.length === 1)
        matchedProduct = matchedProductsBySlug[0]
      else {
        matchedProduct = this._getProductsMatchByMasterVariant(productDraft, matchedProductsBySlug)
        if (!matchedProduct)
          matchedProduct = products[0]
      }
    }

    return matchedProduct
  }

  _getProductMatchByVariantSkus (productDraft, products) {
    let matchedProduct = null
    const productDraftSkus = this._getProductDraftSkus(productDraft)
    for (const product of products) {
      const productSkus = this._getProductVariants(product).map(v => v.sku)
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

  _saveTransaction (actions) {
    const transactionKey = '' // productId + timestamp
    const object = this.customObjectService.save({
      container: 'commercetools-sync-unprocessed-product-reassignment-actions',
      key: transactionKey,
      actions
    })

    this.unfinishedTransactions.push(object)

    return transactionKey
  }

  _selectProductDraftsForReassignment (productDrafts, existingProducts) {
    const skuToProductMap = new Map()
    existingProducts.forEach((p) => {
      skuToProductMap.set(p.masterVariant.sku, p)
      p.variants.forEach(v => skuToProductMap.set(v.sku, p))
    })
    return productDrafts.filter(productDraft =>
      this._isReassignmentNeeded(productDraft, skuToProductMap)
    )
  }

  /**
   * Product draft needs reassignment in these cases:
   * 1. more than 1 product matches the draft's SKUs
   * 2. or CTP product does not have exact SKU match with product draft
   * 3. or product type is not the same
   */
  _isReassignmentNeeded (productDraft, skuToProductMap) {
    const productSet = new Set()
    const skus = this._getProductDraftSkus(productDraft)
    skus.forEach((sku) => {
      const product = skuToProductMap.get(sku)
      if (product)
        productSet.add(product)
    })
    if (productSet.size === 0)
    // new product from the product draft
      return false
    else if (productSet.size === 1) {
      // variants are assigned correctly, maybe we need to change product type
      const product = productSet.values().next().value
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
   * @returns {{matchingProducts, ctpProductToUpdate}}
   * @private
   */
  _getRemovedVariants (productDraft, matchingProducts, ctpProductToUpdate) {
    const productsToRemoveVariants = matchingProducts.filter(p => p !== ctpProductToUpdate)
    const skus = this._getProductDraftSkus(productDraft)
    const collectVariantsWithCondition = (product, condition) => {
      const currentVariants = this._getProductVariants(product, true)
      const stagedVariants = this._getProductVariants(product)

      const variants = stagedVariants

      // if variant is only in current and not in staged, push it to variants collection
      currentVariants.forEach((current) => {
        const isInStaged = stagedVariants.some(staged => staged.sku === current.sku)
        if (!isInStaged)
          variants.push(current)
      })

      const variantsToBeCollected = variants.filter(condition)
      if (variantsToBeCollected.length)
        return variantsToBeCollected
      return []
    }

    // variants that needs to be moved from matching product
    const matchingProductsVariants = productsToRemoveVariants.map(product =>
      collectVariantsWithCondition(product, variant => skus.includes(variant.sku))
    )
    // variants that needs to be removed from CTP product to update
    const ctpProductToUpdateVariants
      = collectVariantsWithCondition(ctpProductToUpdate, variant => !skus.includes(variant.sku))

    return {
      matchingProductsVars: matchingProductsVariants,
      ctpProductToUpdateVars: ctpProductToUpdateVariants
    }
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
    }

    return productDraftClone
  }

  _backupToCustomObject (newProductDraft, backupProductDraft, variants) {
    return this.transactionService.createTransaction({
      newProductDraft,
      backupProductDraft,
      variants
    })
  }

  _fetchMatchingProductsForReassignment (productDraft) {
    const skus = this._getProductDraftSkus(productDraft)
    return this.productService.getProductsBySkus(skus)
  }

  _getProductDraftSkus (product) {
    let result = [product.masterVariant.sku]
    if (product.variants)
      result = result.concat(product.variants.map(v => v.sku))
    return result
  }

  _getProductVariants (product, isCurrent) {
    if (isCurrent)
      return product.masterData.current.variants
        .concat(product.masterData.current.masterVariant)
    return product.masterData.staged.variants
      .concat(product.masterData.staged.masterVariant)
  }

  _createNewProduct () {
  }

  /**
   * Create a backup of a product because we need to do product type change for this product
   */
  async _backupProductForProductTypeChange (transactionObject, ctpProductToUpdate) {
    if (!transactionObject.ctpProductToUpdate) {
      const transactionKey = transactionObject.key
      transactionObject = await this.transactionService.getTransaction(transactionKey)
      const transactionValue = transactionObject.value
      transactionValue.ctpProductToUpdate = ctpProductToUpdate
      await this.transactionService.createOrUpdateTransactionValue(transactionValue, transactionKey)
    }
  }

  async _changeProductType (transaction, ctpProductToUpdate, productTypeId) {
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
    await this.transactionService.createOrUpdateTransactionValue(transaction, transactionKey)
  }

  /**
   * Verify that there are no other products in the platform that has slugs of productDraft
   * except ctpProductToUpdate.
   * This method should cover the test variant-reassignment-example-7.spec.js
   */
  _ensureSlugUniqueness () {
  }

  /**
   * Create a product containing all variants that should be removed from ctpProductToUpdate.
   * @private
   */
  _createAnonymizedProduct () {
  }

  _removeVariantsFromCtpProductToUpdate () {
  }

  _createVariantsInCtpProductToUpdate () {
  }

  _removeVariantsFromMatchingProducts () {
  }

}
