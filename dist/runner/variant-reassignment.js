import _Object$keys from 'babel-runtime/core-js/object/keys';
import _Array$from from 'babel-runtime/core-js/array/from';
import _Set from 'babel-runtime/core-js/set';
import _Map from 'babel-runtime/core-js/map';
import _Object$entries from 'babel-runtime/core-js/object/entries';
import _asyncToGenerator from 'babel-runtime/helpers/asyncToGenerator';
import _ from 'lodash';
import Promise from 'bluebird';
import errorToJson from 'utils-error-to-json';
import ProductService from '../services/product-manager';
import TransactionService from '../services/transaction-manager';

export default class VariantReassignment {

  constructor(client, logger, options = {}, retainExistingData = []) {
    // When we run execute method it also fetch and process all unfinished transactions
    // but only for the first time - this is ensured by firstRun variable which is set to false
    // after first run
    this.firstRun = true;
    this.retainExistingData = retainExistingData;
    this.logger = logger;
    this.productService = new ProductService(logger, client);
    this.transactionService = new TransactionService(logger, client);
  }

  /**
   * Take a list of product drafts and existing products matched by sku
   *  - for every productDraft check if reassignment is needed
   *  - if yes, create and process actions which will move variants across products
   * @param productDrafts List of productDrafts
   * @param productTypeCache List of resolved product drafts - in some cases, product type ID
   * in product draft is name and not ID - in this case, we use the cache to get ID
   * @returns {Promise<boolean>} true if reassignment has been executed
   */
  execute(productDrafts, productTypeCache) {
    var _this = this;

    return _asyncToGenerator(function* () {
      let products;

      try {
        if (_this.firstRun) yield _this._processUnfinishedTransactions();
      } catch (e) {
        return _this._error('Could not process unfinished transactions', e);
      }
      _this.firstRun = false;

      try {
        products = yield _this.productService.fetchProductsFromProductDrafts(productDrafts);
      } catch (e) {
        return _this._error('Error while fetching products for reassignment', e);
      }

      const productDraftsForReassignment = _this._selectProductDraftsForReassignment(productDrafts, products);

      _this.logger.debug('Filtered %d productDrafts for reassignment', productDraftsForReassignment.length);

      const isReassignmentRequired = productDraftsForReassignment.length;
      if (isReassignmentRequired) {
        for (const productDraft of productDraftsForReassignment) try {
          if (productTypeCache) productDraft.productType.id = productTypeCache[productDraft.productType.id].id;
          yield _this._processProductDraft(productDraft, products);
        } catch (e) {
          const error = e instanceof Error ? errorToJson(e) : e;
          _this.logger.error('Error while processing productDraft %j, retrying.', productDraft.name, error);
          yield _this._handleProcessingError(productDraft, products);
        } finally {
          _this.logger.debug('Finished processing of productDraft with name %j', productDraft.name);
        }
        return true;
      }
      return false;
    })();
  }

  _handleProcessingError(productDraft, products) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      const transactions = yield _this2.transactionService.getTransactions();
      const failedTransaction = transactions.find(function ({ value }) {
        return _.isEqual(value.newProductDraft.name, productDraft.name);
      });

      return failedTransaction
      // transaction was created but not finished, try to finish it
      ? _this2._processUnfinishedTransactions(transactions)
      // transaction was not created, try to process productDraft again
      : _this2._processProductDraft(productDraft, products);
    })();
  }

  /**
   * Log error and return Promise.reject
   * @param msg String with error description
   * @param e Error object with details
   * @return <Promise.reject>
   * @private
   */
  _error(msg, e) {
    const error = e instanceof Error ? errorToJson(e) : e;
    this.logger.error(msg, e);
    return Promise.reject(new Error(`${msg} - ${error}`));
  }

  /**
   * Load unfinished transactions from customObject and try to finish them
   * @private
   */
  _processUnfinishedTransactions(transactions = null) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      if (!transactions) {
        _this3.logger.debug('Loading unfinished transactions');
        transactions = yield _this3.transactionService.getTransactions();
      }

      for (const transactionObject of transactions) {
        const { key, value: transaction } = transactionObject;

        _this3.logger.debug('Processing unfinished transaction with key %s', key);
        try {
          yield _this3._createAndExecuteActions(transaction.newProductDraft, transaction.backupProductDraft, transaction.variants, transaction.ctpProductToUpdate, transactionObject);
          yield _this3.transactionService.deleteTransaction(key);
        } catch (e) {
          const error = e instanceof Error ? errorToJson(e) : e;
          _this3.logger.error('Could not process unfinished transaction', error);
          throw e;
        }
      }
    })();
  }

  _processProductDraft(productDraft, products) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      _this4.logger.debug('Processing reassignment for productDraft with name %j', productDraft.name);

      const matchingProducts = yield _this4._selectMatchingProducts(productDraft, products);

      if (matchingProducts.length === 0) return;

      // select using SLUG, etc..
      const ctpProductToUpdate = _this4._selectCtpProductToUpdate(productDraft, matchingProducts);
      _this4.logger.debug('Selected ctpProductToUpdate with id "%s"', ctpProductToUpdate.id);

      // get variants and draft to backup
      const { matchingProductsVars: backupVariants, ctpProductToUpdateVars: variantsToProcess } = _this4._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate);

      const anonymizedProductDraft = _this4._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess);

      _this4.logger.debug('Will remove %d and reassign %d variants', variantsToProcess.length, backupVariants.length);

      // create a backup object
      const transaction = yield _this4._backupToCustomObject(productDraft, backupVariants, anonymizedProductDraft);

      yield _this4._createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants, ctpProductToUpdate, transaction, matchingProducts);
      yield _this4.transactionService.deleteTransaction(transaction.key);
    })();
  }

  _createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants, ctpProductToUpdate, transaction, matchingProducts) {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      // load products for backupVariants -> matching products
      if (!matchingProducts) {
        matchingProducts = yield _this5._selectMatchingProducts(productDraft);
        // load CTP product to update for backupProductDraft -> CTP product to update

        const productToUpdateCandidate = _this5._selectCtpProductToUpdate(productDraft, matchingProducts);

        // if there is no ctpProductToUpdate or it is the same as candidate, take candidate
        if (!ctpProductToUpdate || _this5.productService.isProductsSame(productToUpdateCandidate, ctpProductToUpdate)) ctpProductToUpdate = productToUpdateCandidate;else
          // ctpProductToUpdate has been deleted and not recreated with correct product type id
          ctpProductToUpdate = yield _this5._createNewProduct(ctpProductToUpdate, productDraft.productType.id);
      }

      // check if product types are the same for productDraft and CTP product to update
      const ctpProductTypeId = ctpProductToUpdate.productType.id;
      const draftProductType = productDraft.productType.id;
      matchingProducts = matchingProducts.filter(function (product) {
        return product.id !== ctpProductToUpdate.id;
      });
      if (draftProductType !== ctpProductTypeId) {
        ctpProductToUpdate = yield _this5._changeProductType(transaction, ctpProductToUpdate, draftProductType);
        // find and replace ctpProductToUpdate in matchingProducts array with updated version
        matchingProducts = _this5._replaceProductInProductArray(ctpProductToUpdate, matchingProducts);
      }
      matchingProducts = yield _this5._removeVariantsFromMatchingProducts(backupVariants, matchingProducts);

      // when creating variant, also ensure about sameForAll attrs - Examples 9,10,11
      ctpProductToUpdate = yield _this5._createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate);

      // this is done only when variants are removed from ctpProductToUpdate
      if (anonymizedProductDraft) {
        yield _this5._removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate);
        yield _this5._ensureProductCreation(anonymizedProductDraft);
      }

      // e.g. Example 7
      yield _this5._ensureSlugUniqueness(productDraft, matchingProducts.filter(function (product) {
        return product.id !== ctpProductToUpdate.id;
      }));
    })();
  }

  _replaceProductInProductArray(productToReplace, productArray) {
    const productToReplaceSkus = this.productService.getProductSkus(productToReplace);
    return productArray.map(product => {
      const productSkus = this.productService.getProductSkus(product);
      if (_.isEqual(productSkus, productToReplaceSkus)) return productToReplace;
      return product;
    });
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
  _selectCtpProductToUpdate(productDraft, products) {
    const matchBySkus = this._getProductMatchByVariantSkus(productDraft, products);
    if (matchBySkus) return matchBySkus;
    const matchBySlug = this._getProductsMatchBySlug(productDraft, products);
    if (matchBySlug.length === 1) return matchBySlug[0];
    const matchByMasterVariant = this._getProductsMatchByMasterVariant(productDraft, matchBySlug);
    return matchByMasterVariant || products[0];
  }

  _getProductMatchByVariantSkus(productDraft, products) {
    let matchedProduct = null;
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft);
    for (const product of products) {
      const productSkus = this.productService.getProductSkus(product);
      // https://lodash.com/docs/4.17.4#xor
      if (_.isEmpty(_.xor(productDraftSkus, productSkus))) {
        matchedProduct = product;
        break;
      }
    }
    return matchedProduct;
  }

  _getProductsMatchBySlug(productDraft, products) {
    const matchedProducts = [];
    const productDraftSlugs = productDraft.slug;
    for (const product of products) for (const [lang, slug] of _Object$entries(productDraftSlugs)) if (product.masterData.staged.slug[lang] === slug) {
      matchedProducts.push(product);
      break;
    }
    return matchedProducts;
  }

  _getProductsMatchByMasterVariant(productDraft, products) {
    const masterVariantSku = productDraft.masterVariant.sku;
    return products.find(p => p.masterData.staged.masterVariant.sku === masterVariantSku);
  }

  _selectProductDraftsForReassignment(productDrafts, ctpProducts) {
    const skuToProductMap = this._createSkuToProductMap(ctpProducts);
    return productDrafts.filter(productDraft => this._isReassignmentNeeded(productDraft, skuToProductMap));
  }

  _createSkuToProductMap(ctpProducts) {
    const skuToProductMap = new _Map();
    ctpProducts.forEach(p => {
      const skus = this.productService.getProductSkus(p);
      skus.forEach(sku => skuToProductMap.set(sku, p));
    });
    return skuToProductMap;
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
  _isReassignmentNeeded(productDraft, skuToProductMap) {
    const productSet = new _Set();
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft);
    productDraftSkus.forEach(sku => {
      const product = skuToProductMap.get(sku);
      if (product) productSet.add(product);
    });
    if (productSet.size === 0) {
      // check for product matches by slug
      const products = _Array$from(skuToProductMap.values());
      this._selectMatchingProductsBySlug(products, productDraft).forEach(p => productSet.add(p));
    }
    if (productSet.size === 0)
      // new product from the product draft
      return false;else if (productSet.size === 1) {
      // check if CTP product have exact SKU match with product draft
      const product = productSet.values().next().value;
      const draftSkus = this.productService.getProductDraftSkus(productDraft);
      const productSkus = this.productService.getProductSkus(product);
      if (_.isEqual(draftSkus, productSkus)) {
        // variants are assigned correctly, maybe we need to change product type
        const productTypeId = product.productType.id;
        const productDraftTypeId = productDraft.productType.id;
        if (productTypeId === productDraftTypeId)
          // product type are correct, check if product slugs are unique
          return product.masterData.staged.slug !== productDraft.slug;
      }
    }
    return true;
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
  _getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate) {
    const productsToRemoveVariants = matchingProducts.filter(p => p !== ctpProductToUpdate);
    const skus = this.productService.getProductDraftSkus(productDraft);

    // variants that needs to be moved from matching product
    const matchingProductsVariants = productsToRemoveVariants.map(product => this._selectVariantsWithCondition(product, variant => skus.includes(variant.sku)));

    // variants that needs to be removed from CTP product to update
    const ctpProductToUpdateVariants = this._selectVariantsWithCondition(ctpProductToUpdate, variant => !skus.includes(variant.sku));

    return {
      matchingProductsVars: _.flatten(matchingProductsVariants),
      ctpProductToUpdateVars: ctpProductToUpdateVariants
    };
  }

  _selectVariantsWithCondition(product, condition) {
    const skuToVariantObject = this.productService.getProductVariantsMapBySku(product);
    const variants = _.values(skuToVariantObject);
    return variants.filter(condition);
  }

  _createProductDraftWithRemovedVariants(product, variantsToBackup) {
    let productDraftClone;
    if (variantsToBackup.length > 0) {
      productDraftClone = _.cloneDeep(product.masterData.staged);
      productDraftClone.key = product.key;
      productDraftClone.productType = product.productType;
      productDraftClone.taxCategory = product.taxCategory;
      productDraftClone.state = product.state;
      productDraftClone.reviewRatingStatistics = product.reviewRatingStatistics;
      productDraftClone.masterVariant = variantsToBackup[0];
      productDraftClone.variants = variantsToBackup.slice(1, variantsToBackup.length);
      productDraftClone = this.productService.getAnonymizedProductDraft(productDraftClone);
    }

    return productDraftClone;
  }

  _backupToCustomObject(newProductDraft, variants, backupProductDraft) {
    const transaction = {
      newProductDraft,
      variants
    };
    if (backupProductDraft) transaction.backupProductDraft = backupProductDraft;
    return this.transactionService.createTransaction(transaction);
  }

  /**
   * Select products that has at least one variant
   * or at least one matching slug with the productDraft.
   * @param productDraft
   * @param products if present, then this will be used and no fetching from CTP is needed
   * @returns {*}
   * @private
   */
  _selectMatchingProducts(productDraft, products) {
    const productDraftSkus = this.productService.getProductDraftSkus(productDraft);
    const productDraftSlugs = productDraft.slug;
    if (products) {
      // select products that matches by at least one slug with productDraft
      const matchingProductsBySlug = this._selectMatchingProductsBySlug(products, productDraft);
      // select products that matches by at least one variant with productDraft
      const matchingProductsBySku = this._selectMatchingProductsBySkus(products, productDraftSkus);
      return _.compact(_.uniq(matchingProductsBySku.concat(matchingProductsBySlug)));
    }
    return this.productService.getProductsBySkusOrSlugs(productDraftSkus, productDraftSlugs);
  }

  /* eslint-disable no-labels */
  _selectMatchingProductsBySlug(products, productDraft) {
    return products.filter(product => {
      let isMatchBySlug = false;
      representationLoop: for (const representation of ['staged', 'current']) {
        const productSlug = product.masterData[representation].slug;
        for (const locale of _Object$keys(productSlug)) if (productSlug[locale] === productDraft.slug[locale]) {
          isMatchBySlug = true;
          break representationLoop;
        }
      }
      return isMatchBySlug;
    });
  }
  /* eslint-enable no-labels */

  _selectMatchingProductsBySkus(products, productDraftSkus) {
    const skuToProductMap = this._createSkuToProductMap(products);
    const matchingProducts = productDraftSkus.map(sku => skuToProductMap.get(sku));
    return _.compact(matchingProducts);
  }

  _createNewProduct(product, productTypeId) {
    product.productType.id = productTypeId;

    const projection = this.productService.transformProductToProjection(product);
    projection.productType.id = productTypeId;
    return this.productService.createProduct(projection);
  }

  _ensureProductCreation(productDraft) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      const { sku } = productDraft.masterVariant;
      const existingProducts = yield _this6.productService.getProductsBySkus([sku]);

      // productDraft hasn't been created yet
      if (!existingProducts.length) yield _this6.productService.createProduct(productDraft);
    })();
  }

  /**
   * Create a backup of a product because we need to do product type change for this product
   */
  _backupProductForProductTypeChange(transactionObject, ctpProductToUpdate) {
    var _this7 = this;

    return _asyncToGenerator(function* () {
      if (!transactionObject.ctpProductToUpdate) {
        const transactionKey = transactionObject.key;
        const transaction = yield _this7.transactionService.getTransaction(transactionKey);
        transaction.ctpProductToUpdate = ctpProductToUpdate;

        yield _this7.transactionService.upsertTransactionByKey(transaction, transactionKey);
      }
    })();
  }

  _changeProductType(transaction, ctpProductToUpdate, productTypeId) {
    var _this8 = this;

    return _asyncToGenerator(function* () {
      _this8.logger.debug('Changing productType of product %j with id "%s" to productType "%s"', ctpProductToUpdate.masterData.current.name, ctpProductToUpdate.id, productTypeId);

      yield _this8._backupProductForProductTypeChange(transaction, ctpProductToUpdate);

      const updatedProduct = yield _this8.productService.changeProductType(ctpProductToUpdate, productTypeId);
      yield _this8._deleteBackupForProductTypeChange(transaction.key);
      return updatedProduct;
    })();
  }

  /**
   * Delete a backup that was created because of product type change of a product
   */
  _deleteBackupForProductTypeChange(transactionKey) {
    var _this9 = this;

    return _asyncToGenerator(function* () {
      const transaction = yield _this9.transactionService.getTransaction(transactionKey);
      delete transaction.ctpProductToUpdate;
      yield _this9.transactionService.upsertTransactionByKey(transaction, transactionKey);
    })();
  }

  /**
   * Verify that there are no other products in the platform that has slugs of productDraft
   * except ctpProductToUpdate. It's enough to check matchingProducts because it's not probable
   * that there will be a product which has no matching variant, but a conflicting slug.
   *
   * @see variant-reassignment-example-7.spec.js
   */
  _ensureSlugUniqueness(productDraft, matchingProducts) {
    var _this10 = this;

    return _asyncToGenerator(function* () {
      const productDraftSlug = productDraft.slug;
      const productsToAnonymize = matchingProducts.filter(function (product) {
        return _this10._isSlugConflicting(product, productDraftSlug);
      });

      _this10.logger.debug('Anonymizing %d products because of duplicate slugs', productsToAnonymize.length);

      yield Promise.map(productsToAnonymize, function (product) {
        return _this10.productService.anonymizeCtpProduct(product);
      }, { concurrency: 3 });
    })();
  }

  /**
   * The slugs from product and product draft are conflicting when at least one language value
   * from product's slug is the same as in product draft slug
   * @param product
   * @param productDraftSlug
   * @returns {boolean}
   * @private
   */
  _isSlugConflicting(product, productDraftSlug) {
    const productDraftSlugLength = _Object$keys(productDraftSlug).length;

    // if at least one version has conflict in slugs, return true
    for (const version of ['staged', 'current']) {
      const slug = product.masterData[version].slug;
      const slugLength = _Object$keys(slug).length;
      const stagedDraftSlugs = _.merge({}, productDraftSlug, slug);
      const stagedDraftSlugsLength = _Object$keys(stagedDraftSlugs).length;

      const hasSameSlugLang = slugLength + productDraftSlugLength !== stagedDraftSlugsLength;
      const hasAnySameSlugValue = _Object$keys(slug).some(lang => productDraftSlug[lang] === slug[lang]);
      if (hasSameSlugLang && hasAnySameSlugValue) return true;
    }
    return false;
  }

  _removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate) {
    var _this11 = this;

    return _asyncToGenerator(function* () {
      const skusToRemove = _this11.productService.getProductDraftSkus(anonymizedProductDraft);
      yield _this11.productService.removeVariantsFromProduct(ctpProductToUpdate, skusToRemove);
    })();
  }

  _createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate) {
    var _this12 = this;

    return _asyncToGenerator(function* () {
      const actions = [];
      const skuToVariant = new _Map();
      const existingSkus = _this12.productService.getProductSkus(ctpProductToUpdate);
      const variants = productDraft.variants || [];
      variants.concat(productDraft.masterVariant).forEach(function (v) {
        if (!existingSkus.includes(v.sku)) skuToVariant.set(v.sku, v);
      });
      // preserve existing attribute data
      if (!_.isEmpty(_this12.retainExistingData)) backupVariants.forEach(function (backupVariant) {
        const draftVariant = skuToVariant.get(backupVariant.sku);
        _this12.retainExistingData.forEach(function (attrName) {
          // https://lodash.com/docs/4.17.4#at
          const retainedAttr = _.at(backupVariant, attrName);
          if (retainedAttr.length > 0) draftVariant[attrName] = retainedAttr[0];
        });
      });

      // ensure sameForAll constraint
      const setAttrActions = yield _this12._ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant, productDraft);
      actions.push(...setAttrActions);

      // create addVariant actions
      for (const [sku, variant] of skuToVariant) actions.push({
        action: 'addVariant',
        sku,
        key: variant.key,
        prices: variant.prices,
        images: variant.images,
        attributes: variant.attributes
      });

      _this12.logger.debug('Updating ctpProductToUpdate with %d addVariant actions', actions.length);
      return _this12.productService.updateProduct(ctpProductToUpdate, actions);
    })();
  }

  _ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant, productDraft) {
    const variantsToEnsure = [ctpProductToUpdate.masterData.staged.masterVariant].concat(ctpProductToUpdate.masterData.staged.variants).concat(_Array$from(skuToVariant.values()));

    return this.productService.ensureSameForAllAttributes(variantsToEnsure, productDraft.productType.id, productDraft);
  }

  _removeVariantsFromMatchingProducts(backupVariants, matchingProducts) {
    var _this13 = this;

    return _asyncToGenerator(function* () {
      if (!backupVariants.length) return matchingProducts;
      const productToSkusToRemoveMap = new _Map();
      const skuToProductMap = matchingProducts.reduce(function (resultMap, p) {
        _this13.productService.getProductVariants(p).forEach(function (v) {
          resultMap.set(v.sku, p);
        });
        return resultMap;
      }, new _Map());

      for (const variant of backupVariants) {
        const product = skuToProductMap.get(variant.sku);
        const actions = productToSkusToRemoveMap.get(product) || [];

        // if there is a product from where we can delete variant..
        if (product) {
          actions.push(variant.sku);
          productToSkusToRemoveMap.set(product, actions);
        }
      }

      _this13.logger.debug('Removing variants from matching products');
      return Promise.map(_Array$from(productToSkusToRemoveMap), function ([product, skus]) {
        return _this13.productService.removeVariantsFromProduct(product, skus);
      }, { concurrency: 3 }).then(_.compact);
    })();
  }

}