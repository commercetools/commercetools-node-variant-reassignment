'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _from = require('babel-runtime/core-js/array/from');

var _from2 = _interopRequireDefault(_from);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _utilsErrorToJson = require('utils-error-to-json');

var _utilsErrorToJson2 = _interopRequireDefault(_utilsErrorToJson);

var _productManager = require('../services/product-manager');

var _productManager2 = _interopRequireDefault(_productManager);

var _transactionManager = require('../services/transaction-manager');

var _transactionManager2 = _interopRequireDefault(_transactionManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var VariantReassignment = function () {
  function VariantReassignment(client, logger) {
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    var retainExistingData = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
    (0, _classCallCheck3.default)(this, VariantReassignment);

    // When we run execute method it also fetch and process all unfinished transactions
    // but only for the first time - this is ensured by firstRun variable which is set to false
    // after first run
    this.firstRun = true;
    this.retainExistingData = retainExistingData;
    this.logger = logger;
    this.productService = new _productManager2.default(logger, client);
    this.transactionService = new _transactionManager2.default(logger, client);
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


  (0, _createClass3.default)(VariantReassignment, [{
    key: 'execute',
    value: async function execute(productDrafts, productTypeCache) {
      var products = void 0;

      try {
        if (this.firstRun) await this._processUnfinishedTransactions();
      } catch (e) {
        return this._error('Could not process unfinished transactions', e);
      }
      this.firstRun = false;

      try {
        products = await this.productService.fetchProductsFromProductDrafts(productDrafts);
      } catch (e) {
        return this._error('Error while fetching products for reassignment', e);
      }

      var productDraftsForReassignment = this._selectProductDraftsForReassignment(productDrafts, products);

      this.logger.debug('Filtered %d productDrafts for reassignment', productDraftsForReassignment.length);

      var isReassignmentRequired = productDraftsForReassignment.length;
      if (isReassignmentRequired) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = (0, _getIterator3.default)(productDraftsForReassignment), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var productDraft = _step.value;

            try {
              if (productTypeCache) productDraft.productType.id = productTypeCache[productDraft.productType.id].id;
              await this._processProductDraft(productDraft, products);
            } catch (e) {
              var error = e instanceof Error ? (0, _utilsErrorToJson2.default)(e) : e;
              this.logger.error('Error while processing productDraft %j, retrying.', productDraft.name, error);
              await this._handleProcessingError(productDraft, products);
            } finally {
              this.logger.debug('Finished processing of productDraft with name %j', productDraft.name);
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        return true;
      }
      return false;
    }
  }, {
    key: '_handleProcessingError',
    value: async function _handleProcessingError(productDraft, products) {
      var transactions = await this.transactionService.getTransactions();
      var failedTransaction = transactions.find(function (_ref) {
        var value = _ref.value;
        return _lodash2.default.isEqual(value.newProductDraft.name, productDraft.name);
      });

      return failedTransaction
      // transaction was created but not finished, try to finish it
      ? this._processUnfinishedTransactions(transactions)
      // transaction was not created, try to process productDraft again
      : this._processProductDraft(productDraft, products);
    }

    /**
     * Log error and return Promise.reject
     * @param msg String with error description
     * @param e Error object with details
     * @return <Promise.reject>
     * @private
     */

  }, {
    key: '_error',
    value: function _error(msg, e) {
      var error = e instanceof Error ? (0, _utilsErrorToJson2.default)(e) : e;
      this.logger.error(msg, e);
      return _bluebird2.default.reject(new Error(msg + ' - ' + error));
    }

    /**
     * Load unfinished transactions from customObject and try to finish them
     * @private
     */

  }, {
    key: '_processUnfinishedTransactions',
    value: async function _processUnfinishedTransactions() {
      var transactions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

      if (!transactions) {
        this.logger.debug('Loading unfinished transactions');
        transactions = await this.transactionService.getTransactions();
      }

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = (0, _getIterator3.default)(transactions), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var transactionObject = _step2.value;
          var key = transactionObject.key,
              transaction = transactionObject.value;


          this.logger.debug('Processing unfinished transaction with key %s', key);
          try {
            await this._createAndExecuteActions(transaction.newProductDraft, transaction.backupProductDraft, transaction.variants, transaction.ctpProductToUpdate, transactionObject);
            await this.transactionService.deleteTransaction(key);
          } catch (e) {
            var error = e instanceof Error ? (0, _utilsErrorToJson2.default)(e) : e;
            this.logger.error('Could not process unfinished transaction', error);
            throw e;
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }
  }, {
    key: '_processProductDraft',
    value: async function _processProductDraft(productDraft, products) {
      this.logger.debug('Processing reassignment for productDraft with name %j', productDraft.name);

      var matchingProducts = await this._selectMatchingProducts(productDraft, products);

      if (matchingProducts.length === 0) return;

      // select using SLUG, etc..
      var ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts);
      this.logger.debug('Selected ctpProductToUpdate with id "%s"', ctpProductToUpdate.id);

      // get variants and draft to backup

      var _getRemovedVariants2 = this._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate),
          backupVariants = _getRemovedVariants2.matchingProductsVars,
          variantsToProcess = _getRemovedVariants2.ctpProductToUpdateVars;

      var anonymizedProductDraft = this._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess);

      this.logger.debug('Will remove %d and reassign %d variants', variantsToProcess.length, backupVariants.length);

      // create a backup object
      var transaction = await this._backupToCustomObject(productDraft, backupVariants, anonymizedProductDraft);

      await this._createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants, ctpProductToUpdate, transaction, matchingProducts);
      await this.transactionService.deleteTransaction(transaction.key);
    }
  }, {
    key: '_createAndExecuteActions',
    value: async function _createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants, ctpProductToUpdate, transaction, matchingProducts) {
      // load products for backupVariants -> matching products
      if (!matchingProducts) {
        matchingProducts = await this._selectMatchingProducts(productDraft);
        // load CTP product to update for backupProductDraft -> CTP product to update

        var productToUpdateCandidate = this._selectCtpProductToUpdate(productDraft, matchingProducts);

        // if there is no ctpProductToUpdate or it is the same as candidate, take candidate
        if (!ctpProductToUpdate || this.productService.isProductsSame(productToUpdateCandidate, ctpProductToUpdate)) ctpProductToUpdate = productToUpdateCandidate;else
          // ctpProductToUpdate has been deleted and not recreated with correct product type id
          ctpProductToUpdate = await this._createNewProduct(ctpProductToUpdate, productDraft.productType.id);
      }

      // check if product types are the same for productDraft and CTP product to update
      var ctpProductTypeId = ctpProductToUpdate.productType.id;
      var draftProductType = productDraft.productType.id;
      matchingProducts = matchingProducts.filter(function (product) {
        return product.id !== ctpProductToUpdate.id;
      });
      if (draftProductType !== ctpProductTypeId) {
        ctpProductToUpdate = await this._changeProductType(transaction, ctpProductToUpdate, draftProductType);
        // find and replace ctpProductToUpdate in matchingProducts array with updated version
        matchingProducts = this._replaceProductInProductArray(ctpProductToUpdate, matchingProducts);
      }
      matchingProducts = await this._removeVariantsFromMatchingProducts(backupVariants, matchingProducts);

      // when creating variant, also ensure about sameForAll attrs - Examples 9,10,11
      ctpProductToUpdate = await this._createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate);

      // this is done only when variants are removed from ctpProductToUpdate
      if (anonymizedProductDraft) {
        await this._removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate);
        await this._ensureProductCreation(anonymizedProductDraft);
      }

      // e.g. Example 7
      await this._ensureSlugUniqueness(productDraft, matchingProducts.filter(function (product) {
        return product.id !== ctpProductToUpdate.id;
      }));
    }
  }, {
    key: '_replaceProductInProductArray',
    value: function _replaceProductInProductArray(productToReplace, productArray) {
      var _this = this;

      var productToReplaceSkus = this.productService.getProductSkus(productToReplace);
      return productArray.map(function (product) {
        var productSkus = _this.productService.getProductSkus(product);
        if (_lodash2.default.isEqual(productSkus, productToReplaceSkus)) return productToReplace;
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

  }, {
    key: '_selectCtpProductToUpdate',
    value: function _selectCtpProductToUpdate(productDraft, products) {
      var matchBySkus = this._getProductMatchByVariantSkus(productDraft, products);
      if (matchBySkus) return matchBySkus;
      var matchBySlug = this._getProductsMatchBySlug(productDraft, products);
      if (matchBySlug.length === 1) return matchBySlug[0];
      var matchByMasterVariant = this._getProductsMatchByMasterVariant(productDraft, matchBySlug);
      return matchByMasterVariant || products[0];
    }
  }, {
    key: '_getProductMatchByVariantSkus',
    value: function _getProductMatchByVariantSkus(productDraft, products) {
      var matchedProduct = null;
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = (0, _getIterator3.default)(products), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var product = _step3.value;

          var productSkus = this.productService.getProductSkus(product);
          // https://lodash.com/docs/4.17.4#xor
          if (_lodash2.default.isEmpty(_lodash2.default.xor(productDraftSkus, productSkus))) {
            matchedProduct = product;
            break;
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      return matchedProduct;
    }
  }, {
    key: '_getProductsMatchBySlug',
    value: function _getProductsMatchBySlug(productDraft, products) {
      var matchedProducts = [];
      var productDraftSlugs = productDraft.slug;
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = (0, _getIterator3.default)(products), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var product = _step4.value;
          var _iteratorNormalCompletion5 = true;
          var _didIteratorError5 = false;
          var _iteratorError5 = undefined;

          try {
            for (var _iterator5 = (0, _getIterator3.default)((0, _entries2.default)(productDraftSlugs)), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
              var _step5$value = (0, _slicedToArray3.default)(_step5.value, 2),
                  lang = _step5$value[0],
                  slug = _step5$value[1];

              if (product.masterData.staged.slug[lang] === slug) {
                matchedProducts.push(product);
                break;
              }
            }
          } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion5 && _iterator5.return) {
                _iterator5.return();
              }
            } finally {
              if (_didIteratorError5) {
                throw _iteratorError5;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      return matchedProducts;
    }
  }, {
    key: '_getProductsMatchByMasterVariant',
    value: function _getProductsMatchByMasterVariant(productDraft, products) {
      var masterVariantSku = productDraft.masterVariant.sku;
      return products.find(function (p) {
        return p.masterData.staged.masterVariant.sku === masterVariantSku;
      });
    }
  }, {
    key: '_selectProductDraftsForReassignment',
    value: function _selectProductDraftsForReassignment(productDrafts, ctpProducts) {
      var _this2 = this;

      var skuToProductMap = this._createSkuToProductMap(ctpProducts);
      return productDrafts.filter(function (productDraft) {
        return _this2._isReassignmentNeeded(productDraft, skuToProductMap);
      });
    }
  }, {
    key: '_createSkuToProductMap',
    value: function _createSkuToProductMap(ctpProducts) {
      var _this3 = this;

      var skuToProductMap = new _map2.default();
      ctpProducts.forEach(function (p) {
        var skus = _this3.productService.getProductSkus(p);
        skus.forEach(function (sku) {
          return skuToProductMap.set(sku, p);
        });
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

  }, {
    key: '_isReassignmentNeeded',
    value: function _isReassignmentNeeded(productDraft, skuToProductMap) {
      var productSet = new _set2.default();
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      productDraftSkus.forEach(function (sku) {
        var product = skuToProductMap.get(sku);
        if (product) productSet.add(product);
      });
      if (productSet.size === 0) {
        // check for product matches by slug
        var products = (0, _from2.default)(skuToProductMap.values());
        this._selectMatchingProductsBySlug(products, productDraft).forEach(function (p) {
          return productSet.add(p);
        });
      }
      if (productSet.size === 0)
        // new product from the product draft
        return false;else if (productSet.size === 1) {
        // check if CTP product have exact SKU match with product draft
        var product = productSet.values().next().value;
        var draftSkus = this.productService.getProductDraftSkus(productDraft);
        var productSkus = this.productService.getProductSkus(product);
        if (_lodash2.default.isEqual(draftSkus, productSkus)) {
          // variants are assigned correctly, maybe we need to change product type
          var productTypeId = product.productType.id;
          var productDraftTypeId = productDraft.productType.id;
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

  }, {
    key: '_getRemovedVariants',
    value: function _getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate) {
      var _this4 = this;

      var productsToRemoveVariants = matchingProducts.filter(function (p) {
        return p !== ctpProductToUpdate;
      });
      var skus = this.productService.getProductDraftSkus(productDraft);

      // variants that needs to be moved from matching product
      var matchingProductsVariants = productsToRemoveVariants.map(function (product) {
        return _this4._selectVariantsWithCondition(product, function (variant) {
          return skus.includes(variant.sku);
        });
      });

      // variants that needs to be removed from CTP product to update
      var ctpProductToUpdateVariants = this._selectVariantsWithCondition(ctpProductToUpdate, function (variant) {
        return !skus.includes(variant.sku);
      });

      return {
        matchingProductsVars: _lodash2.default.flatten(matchingProductsVariants),
        ctpProductToUpdateVars: ctpProductToUpdateVariants
      };
    }
  }, {
    key: '_selectVariantsWithCondition',
    value: function _selectVariantsWithCondition(product, condition) {
      var skuToVariantObject = this.productService.getProductVariantsMapBySku(product);
      var variants = _lodash2.default.values(skuToVariantObject);
      return variants.filter(condition);
    }
  }, {
    key: '_createProductDraftWithRemovedVariants',
    value: function _createProductDraftWithRemovedVariants(product, variantsToBackup) {
      var productDraftClone = void 0;
      if (variantsToBackup.length > 0) {
        productDraftClone = _lodash2.default.cloneDeep(product.masterData.staged);
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
  }, {
    key: '_backupToCustomObject',
    value: function _backupToCustomObject(newProductDraft, variants, backupProductDraft) {
      var transaction = {
        newProductDraft: newProductDraft,
        variants: variants
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

  }, {
    key: '_selectMatchingProducts',
    value: function _selectMatchingProducts(productDraft, products) {
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      var productDraftSlugs = productDraft.slug;
      if (products) {
        // select products that matches by at least one slug with productDraft
        var matchingProductsBySlug = this._selectMatchingProductsBySlug(products, productDraft);
        // select products that matches by at least one variant with productDraft
        var matchingProductsBySku = this._selectMatchingProductsBySkus(products, productDraftSkus);
        return _lodash2.default.compact(_lodash2.default.uniq(matchingProductsBySku.concat(matchingProductsBySlug)));
      }
      return this.productService.getProductsBySkusOrSlugs(productDraftSkus, productDraftSlugs);
    }

    /* eslint-disable no-labels */

  }, {
    key: '_selectMatchingProductsBySlug',
    value: function _selectMatchingProductsBySlug(products, productDraft) {
      return products.filter(function (product) {
        var isMatchBySlug = false;
        var _arr = ['staged', 'current'];

        representationLoop: for (var _i = 0; _i < _arr.length; _i++) {
          var representation = _arr[_i];
          var productSlug = product.masterData[representation].slug;
          var _iteratorNormalCompletion6 = true;
          var _didIteratorError6 = false;
          var _iteratorError6 = undefined;

          try {
            for (var _iterator6 = (0, _getIterator3.default)((0, _keys2.default)(productSlug)), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
              var locale = _step6.value;

              if (productSlug[locale] === productDraft.slug[locale]) {
                isMatchBySlug = true;
                break representationLoop;
              }
            }
          } catch (err) {
            _didIteratorError6 = true;
            _iteratorError6 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
              }
            } finally {
              if (_didIteratorError6) {
                throw _iteratorError6;
              }
            }
          }
        }

        return isMatchBySlug;
      });
    }
    /* eslint-enable no-labels */

  }, {
    key: '_selectMatchingProductsBySkus',
    value: function _selectMatchingProductsBySkus(products, productDraftSkus) {
      var skuToProductMap = this._createSkuToProductMap(products);
      var matchingProducts = productDraftSkus.map(function (sku) {
        return skuToProductMap.get(sku);
      });
      return _lodash2.default.compact(matchingProducts);
    }
  }, {
    key: '_createNewProduct',
    value: function _createNewProduct(product, productTypeId) {
      product.productType.id = productTypeId;

      var projection = this.productService.transformProductToProjection(product);
      projection.productType.id = productTypeId;
      return this.productService.createProduct(projection);
    }
  }, {
    key: '_ensureProductCreation',
    value: async function _ensureProductCreation(productDraft) {
      var sku = productDraft.masterVariant.sku;

      var existingProducts = await this.productService.getProductsBySkus([sku]);

      // productDraft hasn't been created yet
      if (!existingProducts.length) await this.productService.createProduct(productDraft);
    }

    /**
     * Create a backup of a product because we need to do product type change for this product
     */

  }, {
    key: '_backupProductForProductTypeChange',
    value: async function _backupProductForProductTypeChange(transactionObject, ctpProductToUpdate) {
      if (!transactionObject.ctpProductToUpdate) {
        var transactionKey = transactionObject.key;
        var transaction = await this.transactionService.getTransaction(transactionKey);
        transaction.ctpProductToUpdate = ctpProductToUpdate;

        await this.transactionService.upsertTransactionByKey(transaction, transactionKey);
      }
    }
  }, {
    key: '_changeProductType',
    value: async function _changeProductType(transaction, ctpProductToUpdate, productTypeId) {
      this.logger.debug('Changing productType of product %j with id "%s" to productType "%s"', ctpProductToUpdate.masterData.current.name, ctpProductToUpdate.id, productTypeId);

      await this._backupProductForProductTypeChange(transaction, ctpProductToUpdate);

      var updatedProduct = await this.productService.changeProductType(ctpProductToUpdate, productTypeId);
      await this._deleteBackupForProductTypeChange(transaction.key);
      return updatedProduct;
    }

    /**
     * Delete a backup that was created because of product type change of a product
     */

  }, {
    key: '_deleteBackupForProductTypeChange',
    value: async function _deleteBackupForProductTypeChange(transactionKey) {
      var transaction = await this.transactionService.getTransaction(transactionKey);
      delete transaction.ctpProductToUpdate;
      await this.transactionService.upsertTransactionByKey(transaction, transactionKey);
    }

    /**
     * Verify that there are no other products in the platform that has slugs of productDraft
     * except ctpProductToUpdate. It's enough to check matchingProducts because it's not probable
     * that there will be a product which has no matching variant, but a conflicting slug.
     *
     * @see variant-reassignment-example-7.spec.js
     */

  }, {
    key: '_ensureSlugUniqueness',
    value: async function _ensureSlugUniqueness(productDraft, matchingProducts) {
      var _this5 = this;

      var productDraftSlug = productDraft.slug;
      var productsToAnonymize = matchingProducts.filter(function (product) {
        return _this5._isSlugConflicting(product, productDraftSlug);
      });

      this.logger.debug('Anonymizing %d products because of duplicate slugs', productsToAnonymize.length);

      await _bluebird2.default.map(productsToAnonymize, function (product) {
        return _this5.productService.anonymizeCtpProduct(product);
      }, { concurrency: 3 });
    }

    /**
     * The slugs from product and product draft are conflicting
     * when at least one language from product's slug is the same as in product draft slug
     * @param product
     * @param productDraftSlug
     * @returns {boolean}
     * @private
     */

  }, {
    key: '_isSlugConflicting',
    value: function _isSlugConflicting(product, productDraftSlug) {
      var productDraftSlugLength = (0, _keys2.default)(productDraftSlug).length;

      // if at least one version has conflict in slugs, return true
      var _arr2 = ['staged', 'current'];
      for (var _i2 = 0; _i2 < _arr2.length; _i2++) {
        var version = _arr2[_i2];
        var slug = product.masterData[version].slug;
        var slugLength = (0, _keys2.default)(slug).length;
        var stagedDraftSlugs = _lodash2.default.merge({}, productDraftSlug, slug);
        var stagedDraftSlugsLength = (0, _keys2.default)(stagedDraftSlugs).length;

        if (slugLength + productDraftSlugLength !== stagedDraftSlugsLength) return true;
      }
      return false;
    }
  }, {
    key: '_removeVariantsFromCtpProductToUpdate',
    value: async function _removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate) {
      var skusToRemove = this.productService.getProductDraftSkus(anonymizedProductDraft);
      await this.productService.removeVariantsFromProduct(ctpProductToUpdate, skusToRemove);
    }
  }, {
    key: '_createVariantsInCtpProductToUpdate',
    value: async function _createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate) {
      var _this6 = this;

      var actions = [];
      var skuToVariant = new _map2.default();
      var existingSkus = this.productService.getProductSkus(ctpProductToUpdate);
      var variants = productDraft.variants || [];
      variants.concat(productDraft.masterVariant).forEach(function (v) {
        if (!existingSkus.includes(v.sku)) skuToVariant.set(v.sku, v);
      });
      // preserve existing attribute data
      if (!_lodash2.default.isEmpty(this.retainExistingData)) backupVariants.forEach(function (backupVariant) {
        var draftVariant = skuToVariant.get(backupVariant.sku);
        _this6.retainExistingData.forEach(function (attrName) {
          // https://lodash.com/docs/4.17.4#at
          var retainedAttr = _lodash2.default.at(backupVariant, attrName);
          if (retainedAttr.length > 0) draftVariant[attrName] = retainedAttr[0];
        });
      });

      // ensure sameForAll constraint
      var setAttrActions = await this._ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant, productDraft);
      actions.push.apply(actions, (0, _toConsumableArray3.default)(setAttrActions));

      // create addVariant actions
      var _iteratorNormalCompletion7 = true;
      var _didIteratorError7 = false;
      var _iteratorError7 = undefined;

      try {
        for (var _iterator7 = (0, _getIterator3.default)(skuToVariant), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
          var _step7$value = (0, _slicedToArray3.default)(_step7.value, 2),
              sku = _step7$value[0],
              variant = _step7$value[1];

          actions.push({
            action: 'addVariant',
            sku: sku,
            key: variant.key,
            prices: variant.prices,
            images: variant.images,
            attributes: variant.attributes
          });
        }
      } catch (err) {
        _didIteratorError7 = true;
        _iteratorError7 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion7 && _iterator7.return) {
            _iterator7.return();
          }
        } finally {
          if (_didIteratorError7) {
            throw _iteratorError7;
          }
        }
      }

      this.logger.debug('Updating ctpProductToUpdate with %d addVariant actions', actions.length);
      return this.productService.updateProduct(ctpProductToUpdate, actions);
    }
  }, {
    key: '_ensureSameForAllAttributes',
    value: function _ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant, productDraft) {
      var variantsToEnsure = [ctpProductToUpdate.masterData.staged.masterVariant].concat(ctpProductToUpdate.masterData.staged.variants).concat((0, _from2.default)(skuToVariant.values()));

      return this.productService.ensureSameForAllAttributes(variantsToEnsure, productDraft.productType.id, productDraft);
    }
  }, {
    key: '_removeVariantsFromMatchingProducts',
    value: async function _removeVariantsFromMatchingProducts(backupVariants, matchingProducts) {
      var _this7 = this;

      if (!backupVariants.length) return matchingProducts;
      var productToSkusToRemoveMap = new _map2.default();
      var skuToProductMap = matchingProducts.reduce(function (resultMap, p) {
        _this7.productService.getProductVariants(p).forEach(function (v) {
          resultMap.set(v.sku, p);
        });
        return resultMap;
      }, new _map2.default());

      var _iteratorNormalCompletion8 = true;
      var _didIteratorError8 = false;
      var _iteratorError8 = undefined;

      try {
        for (var _iterator8 = (0, _getIterator3.default)(backupVariants), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
          var variant = _step8.value;

          var product = skuToProductMap.get(variant.sku);
          var actions = productToSkusToRemoveMap.get(product) || [];

          // if there is a product from where we can delete variant..
          if (product) {
            actions.push(variant.sku);
            productToSkusToRemoveMap.set(product, actions);
          }
        }
      } catch (err) {
        _didIteratorError8 = true;
        _iteratorError8 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion8 && _iterator8.return) {
            _iterator8.return();
          }
        } finally {
          if (_didIteratorError8) {
            throw _iteratorError8;
          }
        }
      }

      this.logger.debug('Removing variants from matching products');
      return _bluebird2.default.map((0, _from2.default)(productToSkusToRemoveMap), function (_ref2) {
        var _ref3 = (0, _slicedToArray3.default)(_ref2, 2),
            product = _ref3[0],
            skus = _ref3[1];

        return _this7.productService.removeVariantsFromProduct(product, skus);
      }, { concurrency: 3 }).then(_lodash2.default.compact);
    }
  }]);
  return VariantReassignment;
}();

exports.default = VariantReassignment;