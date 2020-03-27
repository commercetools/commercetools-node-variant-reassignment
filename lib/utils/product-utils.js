function hasAnySlugSameValue (slug1, slug2) {
  return Object.keys(slug1)
    .some(lang => slug1[lang] === slug2[lang])
}


/**
 * The slugs from product and product draft are conflicting when at least one language value
 * from product's slug is the same as in product draft slug
 * @param product
 * @param productDraftSlug
 * @returns {boolean}
 * @private
 */
function isSlugConflicting (product, productDraftSlug) {
  // if at least one version has conflict in slugs, return true
  for (const version of ['staged', 'current']) {
    const slug = product.masterData[version].slug
    const hasAnySameSlugValue = hasAnySlugSameValue(slug, productDraftSlug)
    if (hasAnySameSlugValue)
      return true
  }
  return false
}

module.exports = {
  hasMatchingSlugs,
  isSlugConflicting
}
