# 1. Reactive reassignment

Date: 2018-11-21

## Status

Accepted

## Context

In the current architecture, we always receive a batch of products. For this batch, we check if any products need reassignment.
In order to find out, we search for conflicting products with query by `SKUs and slugs for all locales and both current and staged`.
This query can too long for GET request and fail due to maximum query length limit.  

## Decision
Variant reassignment will be called only in case of errors and it will solve only the currently failed product. In addition, it will be called in specific actions.

## Consequences
Refactoring needs to be done both in reassignment module and also modules that use reassignment (right now only [sphere-product-import](https://github.com/sphereio/sphere-product-import)).

#### [sphere-product-import](https://github.com/sphereio/sphere-product-import) changes
1. Catch all errors and on errors with 400 HTTP status call variant reassignment with the failed product. Reassignment will run in these cases:
    1. Error code is `DuplicateField` and field is `slug`
    1. Error code is `DuplicateField` and field is `sku`
    1. Error code is `InvalidOperation` and message contains `product type` 
1. On product sync action generations check created actions. If one of the action is `removeVariant`, call reassignment module.
The reason is reassignment needs to backup this variant before deletion so we don't lose any data.
1. Compare between the product type from the product draft AND the matching product. If they do not match, call reassignment module to change product type.
1. After reassignment module is finished, [sphere-product-import](https://github.com/sphereio/sphere-product-import) should run again with the updated product.


## Further improvements

#### Variant reassignment changes
1. Parse the error and check what is the cause of the error.
1. Process error code and error message to see if the error is for product type, variant SKUs or slugs.
1. Variant reassignment will try to resolve only errors that it receives. It will NOT proactively search for other possible errors.

#### Product import should kick in after reassignment
Variant reassignment should also have product sync built in. The current solution requires [sphere-product-import](https://github.com/sphereio/sphere-product-import) to refetch the product, which is not performant. 

#### Concurrency problem 
We have a product with 2 variants A,B and this product should be split into 2 products with 1 variant.
1. T1: Reassignment will remove variant B from the product 1 in order to create an anonymized product later.
1. T2: Fetch B will not find any product, reassignment end.
1. T2: Create new product with variant B
1. T1: Anonymized product will run into error because variant B is conflicting.  

For more threads, this could get very complex and hard to predict. Therefore, we will disable concurrency for reassignment using [locks](https://www.npmjs.com/package/await-mutex). 
