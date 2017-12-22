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

  execute (productDrafts, existingProducts) {
    this._processUnfinishedTransactions()

    const productDraftsForReassignment
      = this._selectProductDraftsForReassignment(productDrafts, existingProducts)

    if (productDraftsForReassignment.length)
      for (const productDraft of productDraftsForReassignment)
        this._processProductDraft(productDraft)
  }

  _processUnfinishedTransactions () {
    if (this.firstRun)
      this.unfinishedTransactions = [] // API.getUnfinishedTransactions()

    this.firstRun = false
    for (const transaction of this.unfinishedTransactions)
      this._processTransaction(transaction)
  }

  _processProductDraft (productDraft) {
    const matchingProducts = this._fetchMatchingProductsForReassignment(productDraft)

    if (matchingProducts.length === 0)
      return

    // select using SLUG, etc..
    const ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts)

    // get existing variants attributes
    // and push them to variants in productDrafts (prices, assets, .. )
    const actions = this._createActions(
      productDraft, ctpProductToUpdate, matchingProducts
    )
    const transactionKey = this._saveTransaction(actions)

    this._processTransaction(actions)

    this._deleteTransaction(transactionKey)
  }

  _createActions (productDraft, ctpProductToUpdate, matchingProducts) {
    const actions = []
    const productTypeIsDifferent =
      productDraft.productType !== ctpProductToUpdate.productType

    // Example 2
    if (productTypeIsDifferent)
      actions.push(this._deleteCtpProductToUpdate())

    // Example 1
    actions.push(this._deleteVariantsFromMatchingProducts(matchingProducts))

    // except ctpProductToUpdate
    if (this._thereAreConflictingSlugsInMatchingProducts())
      actions.push(this._anonymizeProductSlugAndKey())

    if (productTypeIsDifferent)
      actions.push(this._createNewProduct(productDraft))  // Example 2
    else
    // create backups of old removed variants in dummy products
      actions.push(this._deleteVariantsFromCtpProductToUpdateAndBackup())
    actions.push(this._addMissingVariants())  // Example 1
    return actions
  }


  // (only SKUs from productDraft) and promote new masterVariants
  // or delete products if no variant lefts
  _deleteVariantsFromMatchingProducts (matchingProducts) {
    console.log(matchingProducts)
  }

  // will create a dummy product or add variants to already existing dummy
  // product where (slug._ctsd === productId)
  _deleteVariantsFromCtpProductToUpdateAndBackup () {
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
    const productDraftSkus = this._getProductSkus(productDraft)
    for (const product of products) {
      const productSkus = this._getProductSkus(product)
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
        if (product.slug[lang] === slug) {
          matchedProducts.push(product)
          break
        }
    return matchedProducts
  }

  _getProductsMatchByMasterVariant (productDraft, products) {
    const masterVariantSku = productDraft.masterVariant.sku
    return products.find(p => p.masterVariant.sku === masterVariantSku)
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

  /**
   * Transaction actions:
   * P1: removeVariant v2
   * P3: create "duplicate" product from P1 with v2
   * P2: removeVariant v3
   * P1: addVariant v3 (different productType does not mind because we took
   *     only retainExistingAttributes and the rest is from productDraft)
   * P2: transform to "duplicate" product because of duplicate slugs
   */
  _processTransaction (transaction) {
    // run through scheduled actions, validate them and execute them
    console.log(transaction)
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
    const skus = this._getProductSkus(productDraft)
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

  _fetchMatchingProductsForReassignment (productDraft) {
    const skus = this._getProductSkus(productDraft)
    return this.productService.getProductsBySkus(skus)
  }

  _getProductSkus (product) {
    return [product.masterVariant.sku]
      .concat(product.variants.map(v => v.sku))
  }

  _deleteTransaction () {
  }

  _deleteCtpProductToUpdate () {
  }

  _thereAreConflictingSlugsInMatchingProducts () {
  }

  _anonymizeProductSlugAndKey () {
  }

  _createNewProduct () {
  }

  _addMissingVariants () {
  }
}
