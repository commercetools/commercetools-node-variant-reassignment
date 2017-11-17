export default class VariantReassignment {

  constructor (logger, options) {
    this.unfinishedTransactions = []
    this.firstRun = true
    this.customObjectService = null // build custom object service
    this.options = options
    this.logger = logger
  }

  execute (productDrafts, existingProducts) {
    this._processUnfinishedTransactions()

    for (const productDraft of productDrafts)
      this._processProductDraft(productDraft, existingProducts)
  }

  _processUnfinishedTransactions () {
    if (this.firstRun)
      this.unfinishedTransactions = [] // API.getUnfinishedTransactions()

    this.firstRun = false
    for (const transaction of this.unfinishedTransactions)
      this._processTransaction(transaction)
  }

  _processProductDraft (productDraft, existingProducts) {
    const matchingProducts = this._selectExistingProductsUsingSkus(
      productDraft, existingProducts
    )

    if (!matchingProducts.length)
      // when there are no matching products on API,
      // let product-importer to create new product
      return

    // select using SLUG, etc..
    const ctpProductToUpdate = this._selectCtpProductToUpdate(
      productDraft, matchingProducts
    )

    if (!this._shouldRunReassignment(
      productDraft, ctpProductToUpdate, matchingProducts
    ))
      return

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

  // Check if productDraft and ctpProductToUpdate have exact match
  // in variants(SKUs) and same productType
  // if not check if we should update ctpProductToUpdate or any of
  // matchingProducts
  //
  // Examples when productDraft and ctpProductToUpdate differs:
  //  productDraft variants: v1, v2, v3
  //  ctpProductToUpdate variants: v1, v2
  //  ------ CASE 1: ----
  //  if(matchingProducts.length > 1) <--- run reassignment  | > 1 because
  // there is still ctpProductToUpdate
  //  ------ CASE 2: ----
  //  if(matchingProducts.length === 1) <--- v3 is new (not in any of
  // matchingProducts so it will be created by product-importer)
  _shouldRunReassignment (productDraft, ctpProductToUpdate, matchingProducts) {
    console.log(matchingProducts)
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
    console.log(products)
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

  _selectExistingProductsUsingSkus () {
    return []
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
