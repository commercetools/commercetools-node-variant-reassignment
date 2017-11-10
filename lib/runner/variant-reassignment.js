export default class VariantReassignment {

  constructor (logger, options) {
    this.unfinishedTransactions = []
    this.firstRun = true
  }

  execute (productDrafts, existingProducts) {
    this._processUnfinishedTransactions()

    for (let productDraft of productDrafts) {
      this._processProductDraft(productDraft, existingProducts)
    }
  }

  _processUnfinishedTransactions () {
    if (firstRun)
      this.unfinishedTransactions = API.getUnfinishedTransactions()

    for (let transaction of this.unfinishedTransactions) {
      this._processTransaction(transaction)
    }
  }

  _processProductDraft (productDraft, existingProducts) {
    const matchingProducts = this._selectExistingProductsUsingSkus(productDraft, existingProducts)

    if (!matchingProducts.length)
      return // when there are no matching products on API, let product-importer to create new product


    const ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts) // select using SLUG, etc..

    if (!this._shouldRunReassignment(productDraft, ctpProductToUpdate, matchingProducts))
      return

    // get existing variants attributes and push them to variants in productDrafts (prices, assets, .. )

    const actions = this._createActions(productDraft, ctpProductToUpdate, matchingProducts)
    const transactionKey = this._saveTransaction(actions)

    this._processTransaction(actions)

    this._deleteTransaction(transactionKey)
  }

  _createActions (productDraft, ctpProductToUpdate, matchingProducts) {
    const actions = []
    const productTypeIsDifferent = productDraft.productType !== ctpProductToUpdate.productType

    if (productTypeIsDifferent)
      actions.push(this._deleteCtpProductToUpdate())  // Example 2

    actions.push(this._deleteVariantsFromMatchingProducts(matchingProducts)) // Example 1

    if (this._thereAreConflictingSlugsInMatchingProducts()) // except ctpProductToUpdate
      actions.push(this._anonymizeProductSlugAndKey())

    if (productTypeIsDifferent)
      actions.push(this._createNewProduct(productDraft))  // Example 2
    else
      actions.push(this._deleteVariantsFromCtpProductToUpdateAndBackup()) // create backups of old removed variants in dummy products
    actions.push(this._addMissingVariants())  // Example 1
    return actions
  }


  // (only SKUs from productDraft) and promote new masterVariants or delete products if no variant lefts
  _deleteVariantsFromMatchingProducts (matchingProducts) {
  }

  // will create a dummy product or add variants to already existing dummy product where (slug._ctsd === productId)
  _deleteVariantsFromCtpProductToUpdateAndBackup () {
  }

  // Check if productDraft and ctpProductToUpdate have exact match in variants(SKUs) and same productType
  // if not check if we should update ctpProductToUpdate or any of matchingProducts
  //
  // Examples when productDraft and ctpProductToUpdate differs:
  //  productDraft variants: v1, v2, v3
  //  ctpProductToUpdate variants: v1, v2
  //  ------ CASE 1: ----
  //  if(matchingProducts.length > 1) <--- run reassignment  | > 1 because there is still ctpProductToUpdate
  //  ------ CASE 2: ----
  //  if(matchingProducts.length === 1) <--- v3 is new (not in any of matchingProducts so it will be created by product-importer)
  _shouldRunReassignment (productDraft, ctpProductToUpdate, matchingProducts) {
    return // magic from above
  }

  /*
  * match by variant sku - pick CTP product that has all variants matches product draft
  * match by slug - pick CTP product that has at least one slug language that matches product draft slug
  * match by same masterVariant sku - pick CTP product that has same master variant as the product draft
  * take the first CTP product
  */
  _selectCtpProductToUpdate (productDraft, products) {
  }

  _saveTransaction (actions) {
    const transactionKey = productId + timestamp

    const object = CustomObject.save({
      container: "commercetools - sync - unprocessed - product - reassignment - actions",
      key: transactionKey,
      actions: actions
    })

    this.unfinishedTransactions.push(object)

    return transactionKey
  }

  /**
   * Transaction actions:
   * P1: removeVariant v2
   * P3: create "duplicate" product from P1 with v2
   * P2: removeVariant v3
   * P1: addVariant v3 (different productType does not mind because we took only retainExistingAttributes and the rest is from productDraft)
   * P2: transform to "duplicate" product because of duplicate slugs
   */
  _processTransaction (transaction) {
    // run through scheduled actions, validate them and execute them
  }

  _selectExistingProductsUsingSkus () {
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