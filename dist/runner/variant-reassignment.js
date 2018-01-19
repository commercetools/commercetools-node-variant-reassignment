'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _from = require('babel-runtime/core-js/array/from');

var _from2 = _interopRequireDefault(_from);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

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

var _productManager = require('../services/product-manager');

var _productManager2 = _interopRequireDefault(_productManager);

var _transactionManager = require('../services/transaction-manager');

var _transactionManager2 = _interopRequireDefault(_transactionManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var VariantReassignment = function () {
  function VariantReassignment(client, logger) {
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    var blackList = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
    var retainExistingAttributes = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : [];
    (0, _classCallCheck3.default)(this, VariantReassignment);

    this.unfinishedTransactions = [];
    this.firstRun = true;
    this.customObjectService = null; // build custom object service
    this.blackList = blackList;
    this.options = options;
    this.logger = logger;
    this.retainExistingAttributes = retainExistingAttributes;
    this.productService = new _productManager2.default(logger, client);
    this.transactionService = new _transactionManager2.default(logger, client);
  }

  (0, _createClass3.default)(VariantReassignment, [{
    key: 'execute',
    value: async function execute(productDrafts, existingProductProjections) {
      this._processUnfinishedTransactions();

      var products = await this.productService.fetchProductsFromProductProjections(existingProductProjections);

      var productDraftsForReassignment = this._selectProductDraftsForReassignment(productDrafts, products);

      if (productDraftsForReassignment.length) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = (0, _getIterator3.default)(productDraftsForReassignment), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _productDraft = _step.value;

            await this._processProductDraft(_productDraft, products);
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
      }
    }
  }, {
    key: '_processUnfinishedTransactions',
    value: async function _processUnfinishedTransactions() {
      if (this.firstRun) this.unfinishedTransactions = []; // API.getUnfinishedTransactions()

      this.firstRun = false;
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = (0, _getIterator3.default)(this.unfinishedTransactions), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var transaction = _step2.value;

          await this._createAndExecuteActions(transaction.newProductDraft, transaction.backupProductDraft, transaction.variants, transaction.ctpProductToUpdate);
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
      var matchingProducts = await this._selectMatchingProducts(productDraft, products);

      if (matchingProducts.length === 0) return;

      // select using SLUG, etc..
      var ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts);

      // get variants and draft to backup

      var _getRemovedVariants2 = this._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate),
          backupVariants = _getRemovedVariants2.matchingProductsVars,
          variantsToProcess = _getRemovedVariants2.ctpProductToUpdateVars;

      var anonymizedProductDraft = this._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess);

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
        if (this.productService.isProductsSame(productToUpdateCandidate, ctpProductToUpdate)) ctpProductToUpdate = productToUpdateCandidate;else
          // ctpProductToUpdate has been deleted and not recreated with correct product type id
          await this._createNewProduct(ctpProductToUpdate, productDraft.productType.id);
      }

      // check if product types are the same for productDraft and CTP product to update
      var ctpProductTypeId = ctpProductToUpdate.productType.id;
      var draftProductType = productDraft.productType.id;
      if (draftProductType !== ctpProductTypeId) ctpProductToUpdate = await this._changeProductType(transaction, ctpProductToUpdate, draftProductType);
      matchingProducts = await this._removeVariantsFromMatchingProducts(backupVariants, matchingProducts);
      // when creating variant, also ensure about sameForAll attrs - Examples 9,10,11
      ctpProductToUpdate = await this._createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate);
      // this is done only when variants are removed from ctpProductToUpdate
      if (anonymizedProductDraft) {
        await this._removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate);
        await this.productService.createProduct(anonymizedProductDraft);
      }
      // e.g. Example 7
      await this._ensureSlugUniqueness(productDraft, matchingProducts);
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
    key: '_saveTransaction',
    value: function _saveTransaction(actions) {
      var transactionKey = ''; // productId + timestamp
      var object = this.customObjectService.save({
        container: 'commercetools-sync-unprocessed-product-reassignment-actions',
        key: transactionKey,
        actions: actions
      });

      this.unfinishedTransactions.push(object);

      return transactionKey;
    }
  }, {
    key: '_selectProductDraftsForReassignment',
    value: function _selectProductDraftsForReassignment(productDrafts, ctpProducts) {
      var _this = this;

      var skuToProductMap = this._createSkuToProductMap(ctpProducts);
      return productDrafts.filter(function (productDraft) {
        return _this._isReassignmentNeeded(productDraft, skuToProductMap);
      });
    }
  }, {
    key: '_createSkuToProductMap',
    value: function _createSkuToProductMap(ctpProducts) {
      var _this2 = this;

      var skuToProductMap = new _map2.default();
      ctpProducts.forEach(function (p) {
        var skus = _this2.productService.getProductSkus(p);
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
      if (productSet.size === 0)
        // new product from the product draft
        return false;else if (productSet.size === 1) {
        // check if CTP product have exact SKU match with product draft
        var product = productSet.values().next().value;
        var draftSkus = this.productService.getProductDraftSkus(productDraft);
        var productSkus = this.productService.getProductSkus(product);

        if (_lodash2.default.isEqual(draftSkus, productSkus))
          // variants are assigned correctly, maybe we need to change product type
          return product.productType.id !== productDraft.productType.id;
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
      var _this3 = this;

      var productsToRemoveVariants = matchingProducts.filter(function (p) {
        return p !== ctpProductToUpdate;
      });
      var skus = this.productService.getProductDraftSkus(productDraft);

      // variants that needs to be moved from matching product
      var matchingProductsVariants = productsToRemoveVariants.map(function (product) {
        return _this3._selectVariantsWithCondition(product, function (variant) {
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
     * Select products that has at least one variant from the productDraft.
     * @param productDraft
     * @param products
     * @returns {*}
     * @private
     */

  }, {
    key: '_selectMatchingProducts',
    value: function _selectMatchingProducts(productDraft, products) {
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      if (products) {
        var skuToProductMap = this._createSkuToProductMap(products);
        var matchingProducts = productDraftSkus.map(function (sku) {
          return skuToProductMap.get(sku);
        });
        return _lodash2.default.uniq(matchingProducts);
      }
      return this.productService.getProductsBySkus(productDraftSkus);
    }
  }, {
    key: '_deleteTransaction',
    value: function _deleteTransaction() {}
  }, {
    key: '_createNewProduct',
    value: function _createNewProduct() {}

    /**
     * Create a backup of a product because we need to do product type change for this product
     */

  }, {
    key: '_backupProductForProductTypeChange',
    value: async function _backupProductForProductTypeChange(transactionObject, ctpProductToUpdate) {
      if (!transactionObject.ctpProductToUpdate) {
        var transactionKey = transactionObject.key;
        transactionObject = await this.transactionService.getTransaction(transactionKey);
        var transactionValue = transactionObject.value;
        transactionValue.ctpProductToUpdate = ctpProductToUpdate;
        await this.transactionService.upsertTransactionByKey(transactionValue, transactionKey);
      }
    }
  }, {
    key: '_changeProductType',
    value: async function _changeProductType(transaction, ctpProductToUpdate, productTypeId) {
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
      var _this4 = this;

      var productDraftSlug = productDraft.slug;
      var productsToAnonymize = matchingProducts.filter(function (product) {
        return _this4._isSlugConflicting(product, productDraftSlug);
      });

      await _bluebird2.default.map(productsToAnonymize, function (product) {
        return _this4.productService.anonymizeCtpProduct(product);
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
      var _arr = ['staged', 'current'];
      for (var _i = 0; _i < _arr.length; _i++) {
        var version = _arr[_i];
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
      var _this5 = this;

      var actions = [];
      var skuToVariant = new _map2.default();
      var existingSkus = this.productService.getProductSkus(ctpProductToUpdate);
      var variants = productDraft.variants || [];
      variants.concat(productDraft.masterVariant).forEach(function (v) {
        if (!existingSkus.includes(v.sku)) skuToVariant.set(v.sku, v);
      });
      // preserve existing attribute data
      if (!_lodash2.default.isEmpty(this.retainExistingAttributes)) backupVariants.forEach(function (backupVariant) {
        var draftVariant = skuToVariant.get(backupVariant.sku);
        _this5.retainExistingAttributes.forEach(function (attrName) {
          // https://lodash.com/docs/4.17.4#at
          var retainedAttr = _lodash2.default.at(backupVariant, attrName);
          if (retainedAttr.length > 0) draftVariant[attrName] = retainedAttr[0];
        });
      });
      // create actions
      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = (0, _getIterator3.default)(skuToVariant), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var _step6$value = (0, _slicedToArray3.default)(_step6.value, 2),
              sku = _step6$value[0],
              variant = _step6$value[1];

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

      return this.productService.updateProduct(ctpProductToUpdate, actions);
    }
  }, {
    key: '_removeVariantsFromMatchingProducts',
    value: async function _removeVariantsFromMatchingProducts(backupVariants, matchingProducts) {
      var _this6 = this;

      var productToSkusToRemoveMap = new _map2.default();
      var skuToProductMap = matchingProducts.reduce(function (resultMap, p) {
        _this6.productService.getProductVariants(p).forEach(function (v) {
          resultMap.set(v.sku, p);
        });
        return resultMap;
      }, new _map2.default());
      var _iteratorNormalCompletion7 = true;
      var _didIteratorError7 = false;
      var _iteratorError7 = undefined;

      try {
        for (var _iterator7 = (0, _getIterator3.default)(backupVariants), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
          var variant = _step7.value;

          var product = skuToProductMap.get(variant.sku);
          var actions = productToSkusToRemoveMap.get(product) || [];
          actions.push(variant.sku);
          productToSkusToRemoveMap.set(product, actions);
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

      return _bluebird2.default.map((0, _from2.default)(productToSkusToRemoveMap), function (_ref) {
        var _ref2 = (0, _slicedToArray3.default)(_ref, 2),
            product = _ref2[0],
            skus = _ref2[1];

        return _this6.productService.removeVariantsFromProduct(product, skus);
      }, { concurrency: 3 }).then(_lodash2.default.compact);
    }
  }]);
  return VariantReassignment;
}();

exports.default = VariantReassignment;